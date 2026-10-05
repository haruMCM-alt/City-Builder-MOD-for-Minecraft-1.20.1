package com.example.citybuilder.items;

import java.util.List;
import javax.annotation.Nullable;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.vehicle.Minecart;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseRailBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.RailShape;
import net.minecraft.world.level.gameevent.GameEvent;

/**
 * Places a "car": a minecart carrying a coloured body block, named after its kind. On a rail it
 * sets off in the direction the player is looking.
 */
public class CarItem extends Item {
   private final CarItem.Kind kind;

   public CarItem(CarItem.Kind k, Properties props) {
      super(props);
      this.kind = k;
   }

   public static Minecart createCar(Level level, Kind kind, double x, double y, double z) {
      Minecart mc = new Minecart(EntityType.MINECART, level);
      mc.setPos(x, y, z);
      mc.setCustomName(Component.translatable("item.citybuilder." + kind.id));
      mc.setCustomNameVisible(true);
      mc.setDisplayBlockState(kind.body.defaultBlockState());
      mc.setDisplayOffset(kind.offset);
      return mc;
   }

   @Override
   public InteractionResult useOn(UseOnContext ctx) {
      Level level = ctx.getLevel();
      BlockPos clicked = ctx.getClickedPos();
      BlockState bs = level.getBlockState(clicked);
      double x;
      double y;
      double z;
      if (bs.getBlock() instanceof BaseRailBlock rail) {
         RailShape shape = rail.getRailDirection(bs, level, clicked, null);
         x = clicked.getX() + 0.5;
         y = clicked.getY() + 0.0625 + (shape.isAscending() ? 0.5 : 0.0);
         z = clicked.getZ() + 0.5;
      } else {
         BlockPos above = clicked.relative(ctx.getClickedFace());
         x = above.getX() + 0.5;
         y = above.getY();
         z = above.getZ() + 0.5;
      }

      if (!level.isClientSide()) {
         Minecart mc = createCar(level, this.kind, x, y, z);
         Player p = ctx.getPlayer();
         if (p != null) {
            float yaw = p.getYRot();
            double vx = -Math.sin(Math.toRadians(yaw)) * 0.4;
            double vz = Math.cos(Math.toRadians(yaw)) * 0.4;
            mc.setDeltaMovement(vx, 0.0, vz);
            mc.setYRot(yaw);
         }

         level.addFreshEntity(mc);
         level.gameEvent(GameEvent.ENTITY_PLACE, clicked, GameEvent.Context.of(p, bs));
         if (p != null && !p.getAbilities().instabuild) {
            ctx.getItemInHand().shrink(1);
         }
      }

      return InteractionResult.sidedSuccess(level.isClientSide());
   }

   @Override
   public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltip, TooltipFlag flag) {
      tooltip.add(Component.translatable("item.citybuilder.car.tooltip").withStyle(ChatFormatting.GRAY));
   }

   public static enum Kind {
      SEDAN("car", Blocks.BLUE_CONCRETE, 6),
      TAXI("taxi", Blocks.YELLOW_CONCRETE, 6),
      TRUCK("truck", Blocks.IRON_BLOCK, 8),
      BUS("bus", Blocks.GREEN_CONCRETE, 9),
      SPORTS("sports_car", Blocks.RED_CONCRETE, 4);

      public final String id;
      public final Block body;
      public final int offset;

      private Kind(String id, Block body, int offset) {
         this.id = id;
         this.body = body;
         this.offset = offset;
      }
   }
}
