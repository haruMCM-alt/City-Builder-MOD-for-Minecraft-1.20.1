package com.example.citybuilder.blocks;

import java.util.List;
import javax.annotation.Nullable;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.Block;

/**
 * An elevator pad. Stand on it and jump to ride up to the next pad in the same column, or
 * sneak to ride down. The travelling itself is handled by {@link ElevatorHandler}.
 */
public class ElevatorBlock extends Block {
   /** How far up or down a pad looks for the next one. */
   public static final int RANGE = 96;

   public ElevatorBlock(Properties props) {
      super(props);
   }

   @Override
   public void appendHoverText(ItemStack stack, @Nullable BlockGetter level, List<Component> tooltip, TooltipFlag flag) {
      tooltip.add(Component.translatable("block.citybuilder.elevator.tooltip.up").withStyle(ChatFormatting.AQUA));
      tooltip.add(Component.translatable("block.citybuilder.elevator.tooltip.down").withStyle(ChatFormatting.GRAY));
   }
}
