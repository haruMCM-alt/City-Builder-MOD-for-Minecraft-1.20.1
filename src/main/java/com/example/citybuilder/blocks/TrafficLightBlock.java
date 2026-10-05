package com.example.citybuilder.blocks;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.util.StringRepresentable;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.EnumProperty;

/**
 * A Japanese-style horizontal traffic signal. Every light in the world derives its colour from
 * the game time, so all signals stay in sync: lights facing north/south run opposite to lights
 * facing east/west, with an all-red gap between the phases.
 */
public class TrafficLightBlock extends HorizontalDirectionalBlock {
   public static final EnumProperty<Signal> SIGNAL = EnumProperty.create("signal", Signal.class);

   /** Full cycle length in ticks: 170 green, 30 yellow, 200 red. */
   public static final int CYCLE = 400;
   private static final int GREEN_END = 170;
   private static final int YELLOW_END = 200;
   private static final int CHECK_INTERVAL = 10;

   public TrafficLightBlock(Properties props) {
      super(props);
      registerDefaultState(stateDefinition.any().setValue(FACING, Direction.NORTH).setValue(SIGNAL, Signal.GREEN));
   }

   private static final net.minecraft.world.phys.shapes.VoxelShape SHAPE_NS = Block.box(0, 0, 4, 16, 13, 12);
   private static final net.minecraft.world.phys.shapes.VoxelShape SHAPE_EW = Block.box(4, 0, 0, 12, 13, 16);

   @Override
   public net.minecraft.world.phys.shapes.VoxelShape getShape(BlockState state, net.minecraft.world.level.BlockGetter level, BlockPos pos,
                                                             net.minecraft.world.phys.shapes.CollisionContext ctx) {
      return state.getValue(FACING).getAxis() == Direction.Axis.Z ? SHAPE_NS : SHAPE_EW;
   }

   @Override
   protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
      builder.add(FACING, SIGNAL);
   }

   @Override
   public BlockState getStateForPlacement(BlockPlaceContext ctx) {
      // Face the player who placed it, like a furnace.
      Direction facing = ctx.getHorizontalDirection().getOpposite();
      return defaultBlockState().setValue(FACING, facing).setValue(SIGNAL, signalAt(ctx.getLevel().getGameTime(), facing));
   }

   public static Signal signalAt(long gameTime, Direction facing) {
      long offset = facing.getAxis() == Direction.Axis.Z ? 0 : CYCLE / 2;
      long t = Math.floorMod(gameTime + offset, CYCLE);
      if (t < GREEN_END) {
         return Signal.GREEN;
      }
      return t < YELLOW_END ? Signal.YELLOW : Signal.RED;
   }

   @Override
   public void onPlace(BlockState state, Level level, BlockPos pos, BlockState old, boolean moving) {
      if (!level.isClientSide && !old.is(this)) {
         level.scheduleTick(pos, this, 1);
      }
   }

   @Override
   public void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
      Signal now = signalAt(level.getGameTime(), state.getValue(FACING));
      if (now != state.getValue(SIGNAL)) {
         level.setBlock(pos, state.setValue(SIGNAL, now), Block.UPDATE_CLIENTS);
      }
      level.scheduleTick(pos, this, CHECK_INTERVAL);
   }

   public enum Signal implements StringRepresentable {
      GREEN("green"),
      YELLOW("yellow"),
      RED("red");

      private final String name;

      Signal(String name) {
         this.name = name;
      }

      @Override
      public String getSerializedName() {
         return name;
      }
   }
}
