package com.example.citybuilder.items;

import java.util.List;
import javax.annotation.Nullable;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;

/**
 * Right-click opens the phone screen (map, clock, weather, status, compass and a command
 * guide). Shift+right-click shares the current location in chat with a clickable teleport.
 */
public class SmartphoneItem extends Item {
   public SmartphoneItem(Properties props) {
      super(props.stacksTo(1));
   }

   @Override
   public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
      ItemStack stack = player.getItemInHand(hand);
      if (player.isShiftKeyDown()) {
         if (!level.isClientSide()) {
            BlockPos pos = player.blockPosition();
            String coords = pos.getX() + " " + pos.getY() + " " + pos.getZ();
            Component link = Component.literal("[" + coords + "]").withStyle(s -> s
               .withColor(ChatFormatting.AQUA)
               .withUnderlined(true)
               .withClickEvent(new ClickEvent(ClickEvent.Action.SUGGEST_COMMAND, "/tp @s " + coords))
               .withHoverEvent(new HoverEvent(HoverEvent.Action.SHOW_TEXT, Component.translatable("item.citybuilder.smartphone.share_hover"))));
            player.sendSystemMessage(Component.translatable("item.citybuilder.smartphone.share", player.getDisplayName(), link));
         }
      } else if (level.isClientSide()) {
         DistExecutor.unsafeRunWhenOn(Dist.CLIENT, () -> com.example.citybuilder.client.ClientHooks::openPhone);
      }
      level.playSound(player, player.blockPosition(), SoundEvents.UI_BUTTON_CLICK.value(), SoundSource.PLAYERS, 0.5F, 1.6F);
      return InteractionResultHolder.sidedSuccess(stack, level.isClientSide());
   }

   @Override
   public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltip, TooltipFlag flag) {
      tooltip.add(Component.translatable("item.citybuilder.smartphone.tooltip").withStyle(ChatFormatting.AQUA));
      tooltip.add(Component.translatable("item.citybuilder.smartphone.tooltip2").withStyle(ChatFormatting.GRAY));
   }
}
