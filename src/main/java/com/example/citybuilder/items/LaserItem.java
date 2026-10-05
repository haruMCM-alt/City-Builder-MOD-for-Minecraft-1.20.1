package com.example.citybuilder.items;

import com.example.citybuilder.config.CityBuilderConfig;
import java.util.List;
import javax.annotation.Nullable;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

public class LaserItem extends Item {
   private static final int COOLDOWN_TICKS = 10;

   public LaserItem(Properties props) {
      super(props.durability(256));
   }

   @Override
   public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
      ItemStack stack = player.getItemInHand(hand);
      double range = CityBuilderConfig.laserRange();
      Vec3 from = player.getEyePosition();
      Vec3 look = player.getLookAngle();
      Vec3 to = from.add(look.scale(range));
      BlockHitResult hit = level.clip(new ClipContext(from, to, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, player));
      if (hit.getType() == HitResult.Type.MISS) {
         if (!level.isClientSide()) {
            player.displayClientMessage(Component.translatable("item.citybuilder.laser.miss", (int) range).withStyle(ChatFormatting.YELLOW), true);
            level.playSound(null, player.blockPosition(), SoundEvents.DISPENSER_FAIL, SoundSource.PLAYERS, 0.4F, 1.0F);
         }
         player.getCooldowns().addCooldown(this, 4);
         return InteractionResultHolder.fail(stack);
      }

      Vec3 landing = findLanding(level, player, from, hit);
      if (landing == null) {
         if (!level.isClientSide()) {
            player.displayClientMessage(Component.translatable("item.citybuilder.laser.blocked").withStyle(ChatFormatting.YELLOW), true);
            level.playSound(null, player.blockPosition(), SoundEvents.DISPENSER_FAIL, SoundSource.PLAYERS, 0.4F, 0.8F);
         }
         player.getCooldowns().addCooldown(this, 4);
         return InteractionResultHolder.fail(stack);
      }

      if (level.isClientSide()) {
         return InteractionResultHolder.sidedSuccess(stack, true);
      }

      ServerLevel sl = (ServerLevel) level;
      Vec3 target = hit.getLocation();
      Vec3 dir = target.subtract(from);
      int steps = (int) Math.max(2, Math.min(80, dir.length() * 2.5));
      for (int i = 1; i <= steps; i++) {
         Vec3 p = from.add(dir.scale((double) i / steps));
         sl.sendParticles(ParticleTypes.END_ROD, p.x, p.y, p.z, 1, 0.0, 0.0, 0.0, 0.0);
      }
      sl.sendParticles(ParticleTypes.SMOKE, from.x, from.y, from.z, 8, 0.1, 0.1, 0.1, 0.02);
      sl.sendParticles(ParticleTypes.PORTAL, target.x, target.y, target.z, 30, 0.5, 0.5, 0.5, 0.1);
      sl.sendParticles(ParticleTypes.FLASH, target.x, target.y, target.z, 1, 0.0, 0.0, 0.0, 0.0);

      if (player.isPassenger()) {
         player.stopRiding();
      }
      player.teleportTo(landing.x, landing.y, landing.z);
      player.fallDistance = 0.0F;
      player.resetFallDistance();
      sl.playSound(null, BlockPos.containing(from), SoundEvents.ENDERMAN_TELEPORT, SoundSource.PLAYERS, 0.6F, 1.4F);
      sl.playSound(null, BlockPos.containing(landing), SoundEvents.ENDERMAN_TELEPORT, SoundSource.PLAYERS, 0.6F, 0.9F);
      player.getCooldowns().addCooldown(this, COOLDOWN_TICKS);
      if (!player.getAbilities().instabuild) {
         stack.hurtAndBreak(1, player, px -> px.broadcastBreakEvent(hand));
      }
      return InteractionResultHolder.sidedSuccess(stack, false);
   }

   /**
    * Finds where the player's whole body fits near the hit: on top of the block when the laser
    * hits a floor, in front of the face otherwise, stepping up a little for ledges and back along
    * the beam when the spot is cramped. Returns null if nowhere nearby is safe.
    */
   @Nullable
   static Vec3 findLanding(Level level, Player player, Vec3 from, BlockHitResult hit) {
      BlockPos hitPos = hit.getBlockPos();
      Vec3 base = switch (hit.getDirection()) {
         case UP -> new Vec3(hit.getLocation().x, hitPos.getY() + 1.0, hit.getLocation().z);
         case DOWN -> new Vec3(hit.getLocation().x, hitPos.getY() - player.getBbHeight() - 0.01, hit.getLocation().z);
         default -> {
            BlockPos front = hitPos.relative(hit.getDirection());
            yield new Vec3(front.getX() + 0.5, Math.max(front.getY(), hit.getLocation().y - 0.5), front.getZ() + 0.5);
         }
      };
      Vec3 back = from.subtract(hit.getLocation()).normalize().scale(0.5);
      for (int retreat = 0; retreat < 8; retreat++) {
         Vec3 c = base.add(back.scale(retreat));
         for (double up = 0; up <= 2.0; up += 0.5) {
            Vec3 p = c.add(0, up, 0);
            if (fits(level, player, p)) {
               // Settle onto the floor if there is one just below, so the player does not take fall damage.
               Vec3 settled = p;
               for (double down = 0.5; down <= 1.0; down += 0.5) {
                  Vec3 q = p.subtract(0, down, 0);
                  if (fits(level, player, q)) {
                     settled = q;
                  } else {
                     break;
                  }
               }
               return settled;
            }
         }
      }
      return null;
   }

   private static boolean fits(Level level, Player player, Vec3 feet) {
      double hw = player.getBbWidth() / 2.0;
      AABB box = new AABB(feet.x - hw, feet.y, feet.z - hw, feet.x + hw, feet.y + player.getBbHeight(), feet.z + hw);
      return level.noCollision(player, box)
         && level.getBlockStates(box.deflate(0.1)).noneMatch(st -> st.getFluidState().is(net.minecraft.tags.FluidTags.LAVA));
   }

   @Override
   public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltip, TooltipFlag flag) {
      tooltip.add(Component.translatable("item.citybuilder.laser.tooltip").withStyle(ChatFormatting.AQUA));
      tooltip.add(Component.translatable("item.citybuilder.laser.tooltip2", CityBuilderConfig.laserRange()).withStyle(ChatFormatting.GRAY));
   }

   @Override
   public boolean isFoil(ItemStack stack) {
      return true;
   }
}
