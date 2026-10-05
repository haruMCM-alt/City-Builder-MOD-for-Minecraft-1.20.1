package com.example.citybuilder.commands;

import com.example.citybuilder.builders.BaseBuilder;
import com.example.citybuilder.builders.CityBuilder;
import com.example.citybuilder.builders.PlaneBuilder;
import com.example.citybuilder.builders.RailBuilder;
import com.example.citybuilder.builders.RoadBuilder;
import com.example.citybuilder.builders.SkyscraperBuilder;
import com.example.citybuilder.builders.StationBuilder;
import com.example.citybuilder.engine.BlockCanvas;
import com.example.citybuilder.engine.BuildManager;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.LongArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.brigadier.exceptions.DynamicCommandExceptionType;
import com.mojang.brigadier.suggestion.SuggestionProvider;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.function.Consumer;
import javax.annotation.Nullable;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.commands.arguments.coordinates.BlockPosArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;

/** All CityBuilder commands. Every build is queued and placed over several ticks; see {@link BuildManager}. */
public final class ModCommands {
   private static final DynamicCommandExceptionType OUT_OF_WORLD = new DynamicCommandExceptionType(
         v -> Component.translatable("citybuilder.error.out_of_world", v));
   private static final DynamicCommandExceptionType UNKNOWN = new DynamicCommandExceptionType(
         v -> Component.translatable("citybuilder.error.unknown_type", v));

   private ModCommands() {
   }

   private static <E extends Enum<E>> SuggestionProvider<CommandSourceStack> suggest(Class<E> type) {
      String[] names = Arrays.stream(type.getEnumConstants()).map(e -> e.name().toLowerCase(Locale.ROOT)).toArray(String[]::new);
      return (ctx, b) -> SharedSuggestionProvider.suggest(names, b);
   }

   private static <E extends Enum<E>> E parse(Class<E> type, String raw) throws CommandSyntaxException {
      try {
         return Enum.valueOf(type, raw.toUpperCase(Locale.ROOT));
      } catch (IllegalArgumentException e) {
         throw UNKNOWN.create(raw);
      }
   }

   private static String lower(Enum<?> e) {
      return e.name().toLowerCase(Locale.ROOT);
   }

   private static LiteralArgumentBuilder<CommandSourceStack> op(String name) {
      return Commands.literal(name).requires(s -> s.hasPermission(2));
   }

   public static void register(CommandDispatcher<CommandSourceStack> d) {
      d.register(op("city")
            .then(Commands.argument("preset", StringArgumentType.word()).suggests(suggest(CityBuilder.Preset.class))
                  .then(Commands.argument("pos", BlockPosArgument.blockPos())
                        .then(Commands.argument("grid", IntegerArgumentType.integer(2, 8))
                              .executes(ctx -> city(ctx, System.nanoTime()))
                              .then(Commands.argument("seed", LongArgumentType.longArg())
                                    .executes(ctx -> city(ctx, LongArgumentType.getLong(ctx, "seed"))))))));

      d.register(op("skyscraper")
            .then(Commands.argument("type", StringArgumentType.word()).suggests(suggest(SkyscraperBuilder.Type.class))
                  .then(Commands.argument("pos", BlockPosArgument.blockPos())
                        .then(Commands.argument("width", IntegerArgumentType.integer(5, 64))
                              .then(Commands.argument("depth", IntegerArgumentType.integer(5, 64))
                                    .then(Commands.argument("floors", IntegerArgumentType.integer(2, 120))
                                          .then(Commands.argument("floorHeight", IntegerArgumentType.integer(3, 10))
                                                .executes(ModCommands::skyscraper))))))));

      d.register(op("base")
            .then(Commands.argument("type", StringArgumentType.word()).suggests(suggest(BaseBuilder.Type.class))
                  .then(Commands.argument("pos", BlockPosArgument.blockPos())
                        .then(Commands.argument("size", IntegerArgumentType.integer(3, 64))
                              .executes(ModCommands::base)))));

      d.register(op("road")
            .then(Commands.argument("type", StringArgumentType.word()).suggests(suggest(RoadBuilder.Type.class))
                  .then(Commands.argument("pos", BlockPosArgument.blockPos())
                        .then(Commands.argument("length", IntegerArgumentType.integer(5, 2048))
                              .then(Commands.argument("axis", StringArgumentType.word()).suggests(suggest(RoadBuilder.Axis.class))
                                    .executes(ModCommands::road))))));

      d.register(op("rail")
            .then(Commands.argument("type", StringArgumentType.word()).suggests(suggest(RailBuilder.Type.class))
                  .then(Commands.argument("pos", BlockPosArgument.blockPos())
                        .then(Commands.argument("length", IntegerArgumentType.integer(10, 2048))
                              .then(Commands.argument("axis", StringArgumentType.word()).suggests(suggest(RailBuilder.Axis.class))
                                    .executes(ModCommands::rail))))));

      d.register(op("station")
            .then(Commands.argument("type", StringArgumentType.word()).suggests(suggest(StationBuilder.Type.class))
                  .then(Commands.argument("pos", BlockPosArgument.blockPos())
                        .then(Commands.argument("length", IntegerArgumentType.integer(20, 200))
                              .then(Commands.argument("axis", StringArgumentType.word()).suggests(suggest(StationBuilder.Axis.class))
                                    .executes(ctx -> station(ctx, null))
                                    .then(Commands.argument("name", StringArgumentType.greedyString())
                                          .executes(ctx -> station(ctx, StringArgumentType.getString(ctx, "name")))))))));

      d.register(op("plane")
            .then(Commands.argument("type", StringArgumentType.word()).suggests(suggest(PlaneBuilder.Type.class))
                  .then(Commands.argument("pos", BlockPosArgument.blockPos())
                        .then(Commands.argument("facing", StringArgumentType.word())
                              .suggests((c, b) -> SharedSuggestionProvider.suggest(new String[]{"east", "west", "south", "north"}, b))
                              .executes(ModCommands::plane)))));

      LiteralArgumentBuilder<CommandSourceStack> cb = op("citybuilder")
            .executes(ModCommands::help)
            .then(Commands.literal("help").executes(ModCommands::help))
            .then(Commands.literal("undo").executes(ModCommands::undo))
            .then(Commands.literal("status").executes(ModCommands::status))
            .then(Commands.literal("cancel").executes(ctx -> cancel(ctx, false))
                  .then(Commands.literal("all").executes(ctx -> cancel(ctx, true))));
      d.register(cb);
      d.register(op("cb").redirect(d.getRoot().getChild("citybuilder")).executes(ModCommands::help));
   }

   @Nullable
   private static UUID owner(CommandSourceStack src) {
      return src.getEntity() instanceof ServerPlayer p ? p.getUUID() : null;
   }

   private static int queue(CommandContext<CommandSourceStack> ctx, Component label, List<Consumer<BlockCanvas>> steps) throws CommandSyntaxException {
      CommandSourceStack src = ctx.getSource();
      ServerLevel level = src.getLevel();
      BlockPos pos = BlockPosArgument.getBlockPos(ctx, "pos");
      if (level.isOutsideBuildHeight(pos) || !level.getWorldBorder().isWithinBounds(pos)) {
         throw OUT_OF_WORLD.create(pos.getY());
      }
      BuildManager.Ticket t = BuildManager.submit(level, owner(src), label, steps);
      if (t.position() == 0) {
         src.sendSuccess(() -> Component.translatable("citybuilder.job.started", label).withStyle(ChatFormatting.GRAY), true);
      } else {
         src.sendSuccess(() -> Component.translatable("citybuilder.job.queued", label, t.position()).withStyle(ChatFormatting.GRAY), true);
      }
      return 1;
   }

   private static int city(CommandContext<CommandSourceStack> ctx, long seed) throws CommandSyntaxException {
      CityBuilder.Preset preset = parse(CityBuilder.Preset.class, StringArgumentType.getString(ctx, "preset"));
      BlockPos pos = BlockPosArgument.getBlockPos(ctx, "pos");
      int grid = IntegerArgumentType.getInteger(ctx, "grid");
      int[] size = CityBuilder.size(preset, grid, seed);
      Component label = Component.translatable("citybuilder.label.city", lower(preset), grid);
      ctx.getSource().sendSuccess(() -> Component.translatable("citybuilder.city.info", lower(preset), size[0], size[1],
            Component.literal(String.valueOf(seed)).withStyle(s -> s.withColor(ChatFormatting.AQUA)
                  .withClickEvent(new ClickEvent(ClickEvent.Action.COPY_TO_CLIPBOARD, String.valueOf(seed))))), false);
      return queue(ctx, label, CityBuilder.plan(preset, pos.getX(), pos.getY(), pos.getZ(), grid, seed));
   }

   private static int skyscraper(CommandContext<CommandSourceStack> ctx) throws CommandSyntaxException {
      SkyscraperBuilder.Type type = parse(SkyscraperBuilder.Type.class, StringArgumentType.getString(ctx, "type"));
      BlockPos pos = BlockPosArgument.getBlockPos(ctx, "pos");
      int w = IntegerArgumentType.getInteger(ctx, "width");
      int dd = IntegerArgumentType.getInteger(ctx, "depth");
      int f = IntegerArgumentType.getInteger(ctx, "floors");
      int fh = IntegerArgumentType.getInteger(ctx, "floorHeight");
      ServerLevel level = ctx.getSource().getLevel();
      // Keep the crown (about 25 blocks above the last floor) inside the world.
      int maxFloors = Math.max(2, (level.getMaxBuildHeight() - pos.getY() - 26) / fh);
      if (f > maxFloors) {
         int requested = f;
         f = maxFloors;
         int clamped = f;
         ctx.getSource().sendSuccess(() -> Component.translatable("citybuilder.warn.floors", requested, clamped)
               .withStyle(ChatFormatting.YELLOW), false);
      }
      int floors = f;
      Component label = Component.translatable("citybuilder.label.skyscraper", lower(type), floors);
      return queue(ctx, label, List.of(l -> SkyscraperBuilder.build(l, type, pos.getX(), pos.getY(), pos.getZ(), w, dd, floors, fh)));
   }

   private static int base(CommandContext<CommandSourceStack> ctx) throws CommandSyntaxException {
      BaseBuilder.Type type = parse(BaseBuilder.Type.class, StringArgumentType.getString(ctx, "type"));
      BlockPos pos = BlockPosArgument.getBlockPos(ctx, "pos");
      int size = IntegerArgumentType.getInteger(ctx, "size");
      Component label = Component.translatable("citybuilder.label.base", lower(type), size);
      return queue(ctx, label, List.of(l -> BaseBuilder.build(l, type, pos.getX(), pos.getY(), pos.getZ(), size)));
   }

   private static int road(CommandContext<CommandSourceStack> ctx) throws CommandSyntaxException {
      RoadBuilder.Type type = parse(RoadBuilder.Type.class, StringArgumentType.getString(ctx, "type"));
      RoadBuilder.Axis axis = parse(RoadBuilder.Axis.class, StringArgumentType.getString(ctx, "axis"));
      BlockPos pos = BlockPosArgument.getBlockPos(ctx, "pos");
      int len = IntegerArgumentType.getInteger(ctx, "length");
      Component label = Component.translatable("citybuilder.label.road", lower(type), len);
      return queue(ctx, label, segments(len, 720, (off, n) -> l -> RoadBuilder.build(l, type,
            pos.getX() + (axis == RoadBuilder.Axis.X ? off : 0), pos.getY(), pos.getZ() + (axis == RoadBuilder.Axis.Z ? off : 0), n, axis)));
   }

   private static int rail(CommandContext<CommandSourceStack> ctx) throws CommandSyntaxException {
      RailBuilder.Type type = parse(RailBuilder.Type.class, StringArgumentType.getString(ctx, "type"));
      RailBuilder.Axis axis = parse(RailBuilder.Axis.class, StringArgumentType.getString(ctx, "axis"));
      BlockPos pos = BlockPosArgument.getBlockPos(ctx, "pos");
      int len = IntegerArgumentType.getInteger(ctx, "length");
      Component label = Component.translatable("citybuilder.label.rail", lower(type), len);
      // Segment lengths are multiples of 24 so pier, lamp and power spacing continue seamlessly.
      return queue(ctx, label, segments(len, 240, (off, n) -> l -> RailBuilder.build(l, type,
            pos.getX() + (axis == RailBuilder.Axis.X ? off : 0), pos.getY(), pos.getZ() + (axis == RailBuilder.Axis.Z ? off : 0), n, axis)));
   }

   private static int station(CommandContext<CommandSourceStack> ctx, @Nullable String name) throws CommandSyntaxException {
      StationBuilder.Type type = parse(StationBuilder.Type.class, StringArgumentType.getString(ctx, "type"));
      StationBuilder.Axis axis = parse(StationBuilder.Axis.class, StringArgumentType.getString(ctx, "axis"));
      BlockPos pos = BlockPosArgument.getBlockPos(ctx, "pos");
      int len = IntegerArgumentType.getInteger(ctx, "length");
      String stationName = name != null ? name.replaceAll("駅$", "") : StationBuilder.defaultName(pos.getX(), pos.getZ());
      Component label = Component.translatable("citybuilder.label.station", stationName, lower(type));
      return queue(ctx, label, List.of(l -> StationBuilder.build(l, type, pos.getX(), pos.getY(), pos.getZ(), len, axis, -1, stationName)));
   }

   private static int plane(CommandContext<CommandSourceStack> ctx) throws CommandSyntaxException {
      PlaneBuilder.Type type = parse(PlaneBuilder.Type.class, StringArgumentType.getString(ctx, "type"));
      String fStr = StringArgumentType.getString(ctx, "facing").toLowerCase(Locale.ROOT);
      PlaneBuilder.Facing facing = switch (fStr) {
         case "east", "e", "+x", "px" -> PlaneBuilder.Facing.PX;
         case "west", "w", "-x", "nx" -> PlaneBuilder.Facing.NX;
         case "south", "s", "+z", "pz" -> PlaneBuilder.Facing.PZ;
         case "north", "n", "-z", "nz" -> PlaneBuilder.Facing.NZ;
         default -> throw UNKNOWN.create(fStr);
      };
      BlockPos pos = BlockPosArgument.getBlockPos(ctx, "pos");
      Component label = Component.translatable("citybuilder.label.plane", lower(type));
      return queue(ctx, label, List.of(l -> PlaneBuilder.build(l, type, pos.getX(), pos.getY(), pos.getZ(), facing)));
   }

   private interface Segment {
      Consumer<BlockCanvas> make(int offset, int length);
   }

   /** Splits a long linear build into steps so planning a 2 km line never stalls a tick. */
   private static List<Consumer<BlockCanvas>> segments(int length, int chunk, Segment seg) {
      List<Consumer<BlockCanvas>> steps = new java.util.ArrayList<>();
      for (int off = 0; off < length; off += chunk) {
         int n = Math.min(chunk, length - off);
         if (n < 5 && off > 0) {
            // Too short to stand alone: extend the previous segment instead.
            steps.remove(steps.size() - 1);
            steps.add(seg.make(off - chunk, chunk + n));
         } else {
            steps.add(seg.make(off, n));
         }
      }
      return steps;
   }

   private static int undo(CommandContext<CommandSourceStack> ctx) {
      CommandSourceStack src = ctx.getSource();
      Component label = BuildManager.undo(src.getServer(), owner(src));
      if (label == null) {
         src.sendFailure(Component.translatable("citybuilder.undo.nothing"));
         return 0;
      }
      int left = BuildManager.undoDepth(owner(src));
      src.sendSuccess(() -> Component.translatable("citybuilder.undo.queued", label, left).withStyle(ChatFormatting.AQUA), true);
      return 1;
   }

   private static int cancel(CommandContext<CommandSourceStack> ctx, boolean all) {
      CommandSourceStack src = ctx.getSource();
      int n = BuildManager.cancel(src.getServer(), owner(src), all);
      src.sendSuccess(() -> Component.translatable("citybuilder.cancel.done", n), true);
      return n;
   }

   private static int status(CommandContext<CommandSourceStack> ctx) {
      CommandSourceStack src = ctx.getSource();
      List<Component> lines = BuildManager.status();
      if (lines.isEmpty()) {
         src.sendSuccess(() -> Component.translatable("citybuilder.status.idle"), false);
      }
      for (Component line : lines) {
         src.sendSuccess(() -> line, false);
      }
      int undo = BuildManager.undoDepth(owner(src));
      src.sendSuccess(() -> Component.translatable("citybuilder.status.undo", undo).withStyle(ChatFormatting.GRAY), false);
      return lines.size();
   }

   private static int help(CommandContext<CommandSourceStack> ctx) {
      CommandSourceStack src = ctx.getSource();
      for (int i = 1; i <= 10; i++) {
         int line = i;
         src.sendSuccess(() -> Component.translatable("citybuilder.help." + line), false);
      }
      return 1;
   }
}
