package com.example.citybuilder.client;

import java.util.List;
import java.util.Optional;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.GlobalPos;
import net.minecraft.core.Holder;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.Mth;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;

/** The smartphone: a home screen with apps, drawn entirely with flat rectangles and text. */
public class PhoneScreen extends Screen {
   private static final int W = 156;
   private static final int H = 260;
   private static final int MAP_RADIUS = 32;

   private enum App {
      HOME(0xFF2F80ED, "M"),
      MAP(0xFF27AE60, "◎"),
      CLOCK(0xFF333333, "◷"),
      WEATHER(0xFF56CCF2, "☀"),
      STATUS(0xFFEB5757, "♥"),
      COMPASS(0xFFF2994A, "✦"),
      HELP(0xFF9B51E0, "?");

      final int color;
      final String glyph;

      App(int color, String glyph) {
         this.color = color;
         this.glyph = glyph;
      }

      Component title() {
         return Component.translatable("phone.citybuilder.app." + name().toLowerCase(java.util.Locale.ROOT));
      }
   }

   private App app = App.HOME;
   private int left;
   private int top;
   private final int[] mapColors = new int[(MAP_RADIUS * 2) * (MAP_RADIUS * 2)];
   private BlockPos mapCenter;
   private long mapTime = -100;

   public PhoneScreen() {
      super(Component.translatable("item.citybuilder.smartphone"));
   }

   @Override
   protected void init() {
      left = (width - W) / 2;
      top = (height - H) / 2;
   }

   @Override
   public boolean isPauseScreen() {
      return false;
   }

   // Screen area inside the bezel.
   private int sx0() { return left + 7; }
   private int sx1() { return left + W - 7; }
   private int sy0() { return top + 18; }
   private int sy1() { return top + H - 28; }

   @Override
   public void render(GuiGraphics g, int mouseX, int mouseY, float partial) {
      renderBackground(g);
      // Body, bezel, speaker and home button.
      g.fill(left - 1, top - 1, left + W + 1, top + H + 1, 0xFF5A5A5A);
      g.fill(left, top, left + W, top + H, 0xFF141414);
      g.fill(left + W / 2 - 14, top + 7, left + W / 2 + 14, top + 10, 0xFF3A3A3A);
      int hx = left + W / 2;
      int hy = top + H - 14;
      g.fill(hx - 8, hy - 8, hx + 8, hy + 8, isHome(mouseX, mouseY) ? 0xFF6A6A6A : 0xFF3A3A3A);
      g.fill(hx - 6, hy - 6, hx + 6, hy + 6, 0xFF141414);

      g.fill(sx0(), sy0(), sx1(), sy1(), 0xFF0E1A2B);
      g.fillGradient(sx0(), sy0(), sx1(), sy1(), 0xFF1B2A44, 0xFF0B1220);
      drawStatusBar(g);

      switch (app) {
         case HOME -> drawHome(g, mouseX, mouseY);
         case MAP -> drawMap(g);
         case CLOCK -> drawClock(g);
         case WEATHER -> drawWeather(g);
         case STATUS -> drawStatus(g);
         case COMPASS -> drawCompass(g);
         case HELP -> drawHelp(g);
      }
      super.render(g, mouseX, mouseY, partial);
   }

   private void drawStatusBar(GuiGraphics g) {
      ClientLevel level = minecraft.level;
      if (level == null) {
         return;
      }
      g.fill(sx0(), sy0(), sx1(), sy0() + 11, 0x66000000);
      small(g, gameTime(level), sx0() + 3, sy0() + 2, 0xFFFFFFFF);
      // Battery: drains over the in-game day.
      int pct = 100 - (int) (level.getDayTime() % 24000L * 100 / 24000L);
      int bx = sx1() - 22;
      g.fill(bx, sy0() + 3, bx + 16, sy0() + 9, 0xFFAAAAAA);
      g.fill(bx + 1, sy0() + 4, bx + 15, sy0() + 8, 0xFF000000);
      g.fill(bx + 1, sy0() + 4, bx + 1 + 14 * Math.max(10, pct) / 100, sy0() + 8, pct < 20 ? 0xFFEB5757 : 0xFF6FCF97);
      g.fill(bx + 16, sy0() + 5, bx + 17, sy0() + 7, 0xFFAAAAAA);
   }

   private void header(GuiGraphics g, App a) {
      int y = sy0() + 13;
      g.fill(sx0(), y, sx1(), y + 14, a.color);
      g.drawString(font, "◀", sx0() + 4, y + 3, 0xFFFFFFFF, false);
      g.drawCenteredString(font, a.title(), (sx0() + sx1()) / 2, y + 3, 0xFFFFFFFF);
   }

   private int contentTop() {
      return sy0() + 31;
   }

   private void drawHome(GuiGraphics g, int mx, int my) {
      g.drawCenteredString(font, Component.translatable("phone.citybuilder.home"), (sx0() + sx1()) / 2, sy0() + 16, 0xFFDDE6F5);
      App[] apps = homeApps();
      for (int i = 0; i < apps.length; i++) {
         int[] r = iconRect(i);
         boolean hover = mx >= r[0] && mx < r[2] && my >= r[1] && my < r[3];
         g.fill(r[0] - 1, r[1] - 1, r[2] + 1, r[3] + 1, hover ? 0xFFFFFFFF : 0x55FFFFFF);
         g.fill(r[0], r[1], r[2], r[3], apps[i].color);
         g.pose().pushPose();
         g.pose().translate((r[0] + r[2]) / 2f, r[1] + 7, 0);
         g.pose().scale(2f, 2f, 1f);
         g.drawCenteredString(font, apps[i].glyph, 0, 0, 0xFFFFFFFF);
         g.pose().popPose();
         Component label = apps[i].title();
         float scale = Math.min(1f, 40f / Math.max(1, font.width(label)));
         g.pose().pushPose();
         g.pose().translate((r[0] + r[2]) / 2f, r[3] + 3, 0);
         g.pose().scale(scale, scale, 1f);
         g.drawCenteredString(font, label, 0, 0, 0xFFFFFFFF);
         g.pose().popPose();
      }
      ClientLevel level = minecraft.level;
      if (level != null) {
         g.pose().pushPose();
         g.pose().translate((sx0() + sx1()) / 2f, sy1() - 40, 0);
         g.pose().scale(2.5f, 2.5f, 1f);
         g.drawCenteredString(font, gameTime(level), 0, 0, 0xFFFFFFFF);
         g.pose().popPose();
         g.drawCenteredString(font, Component.translatable("phone.citybuilder.day", level.getDayTime() / 24000L + 1),
               (sx0() + sx1()) / 2, sy1() - 14, 0xFFB8C7E0);
      }
   }

   private static App[] homeApps() {
      return new App[]{App.MAP, App.CLOCK, App.WEATHER, App.STATUS, App.COMPASS, App.HELP};
   }

   private int[] iconRect(int i) {
      int col = i % 3;
      int row = i / 3;
      int size = 30;
      int gap = (sx1() - sx0() - 3 * size) / 4;
      int x = sx0() + gap + col * (size + gap);
      int y = sy0() + 32 + row * (size + 20);
      return new int[]{x, y, x + size, y + size};
   }

   private void drawMap(GuiGraphics g) {
      header(g, App.MAP);
      LocalPlayer p = minecraft.player;
      ClientLevel level = minecraft.level;
      if (p == null || level == null) {
         return;
      }
      BlockPos pos = p.blockPosition();
      if (mapCenter == null || !mapCenter.equals(pos) && level.getGameTime() - mapTime > 5 || level.getGameTime() - mapTime > 40) {
         refreshMap(level, pos);
      }
      int size = MAP_RADIUS * 2;
      int scale = 2;
      int mx = (sx0() + sx1()) / 2 - MAP_RADIUS * scale;
      int my = contentTop() + 2;
      g.fill(mx - 1, my - 1, mx + size * scale + 1, my + size * scale + 1, 0xFF000000);
      for (int dz = 0; dz < size; dz++) {
         for (int dx = 0; dx < size; dx++) {
            int c = mapColors[dz * size + dx];
            g.fill(mx + dx * scale, my + dz * scale, mx + dx * scale + scale, my + dz * scale + scale, c);
         }
      }
      // Player arrow.
      int cx = mx + MAP_RADIUS * scale;
      int cy = my + MAP_RADIUS * scale;
      float yaw = p.getYRot() * Mth.DEG_TO_RAD;
      float fx = -Mth.sin(yaw);
      float fz = Mth.cos(yaw);
      for (int i = 0; i <= 5; i++) {
         int ax = cx + Math.round(fx * i);
         int ay = cy + Math.round(fz * i);
         g.fill(ax - 1, ay - 1, ax + 1, ay + 1, 0xFFFF3B3B);
      }
      g.fill(cx - 2, cy - 2, cx + 2, cy + 2, 0xFFFFFFFF);
      g.drawString(font, "N", cx - 2, my + 1, 0xFFFFFFFF, true);

      int ty = my + size * scale + 5;
      small(g, "X " + pos.getX() + "  Y " + pos.getY() + "  Z " + pos.getZ(), sx0() + 4, ty, 0xFFFFFFFF);
      small(g, biomeName(level, pos).getString(), sx0() + 4, ty + 10, 0xFFB8E0B8);
   }

   private void refreshMap(ClientLevel level, BlockPos center) {
      mapCenter = center;
      mapTime = level.getGameTime();
      int size = MAP_RADIUS * 2;
      BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
      for (int dz = 0; dz < size; dz++) {
         for (int dx = 0; dx < size; dx++) {
            int x = center.getX() + dx - MAP_RADIUS;
            int z = center.getZ() + dz - MAP_RADIUS;
            int color = 0xFF202020;
            if (level.hasChunk(x >> 4, z >> 4)) {
               int h = level.getHeight(Heightmap.Types.WORLD_SURFACE, x, z) - 1;
               m.set(x, h, z);
               BlockState st = level.getBlockState(m);
               MapColor mc = st.getMapColor(level, m);
               int tries = 0;
               while (mc == MapColor.NONE && h > level.getMinBuildHeight() && tries++ < 8) {
                  m.setY(--h);
                  st = level.getBlockState(m);
                  mc = st.getMapColor(level, m);
               }
               // Shade by height relative to the player, like a relief map.
               MapColor.Brightness b = h > center.getY() + 3 ? MapColor.Brightness.HIGH
                     : h < center.getY() - 6 ? MapColor.Brightness.LOW : MapColor.Brightness.NORMAL;
               int abgr = mc.calculateRGBColor(b);
               color = 0xFF000000 | (abgr & 0xFF) << 16 | (abgr >> 8 & 0xFF) << 8 | (abgr >> 16 & 0xFF);
            }
            mapColors[dz * size + dx] = color;
         }
      }
   }

   private void drawClock(GuiGraphics g) {
      header(g, App.CLOCK);
      ClientLevel level = minecraft.level;
      if (level == null) {
         return;
      }
      int cx = (sx0() + sx1()) / 2;
      int y = contentTop() + 20;
      g.pose().pushPose();
      g.pose().translate(cx, y, 0);
      g.pose().scale(3f, 3f, 1f);
      g.drawCenteredString(font, gameTime(level), 0, 0, 0xFFFFFFFF);
      g.pose().popPose();
      long dayTime = level.getDayTime() % 24000L;
      boolean day = dayTime < 12300 || dayTime > 23850;
      g.drawCenteredString(font, Component.translatable("phone.citybuilder.day", level.getDayTime() / 24000L + 1), cx, y + 36, 0xFFDDE6F5);
      g.drawCenteredString(font, Component.translatable(day ? "phone.citybuilder.daytime" : "phone.citybuilder.night"), cx, y + 50,
            day ? 0xFFFFE08A : 0xFF9DB4FF);
      g.drawCenteredString(font, Component.translatable("phone.citybuilder.moon." + level.getMoonPhase()), cx, y + 64, 0xFFCCCCCC);
      // Progress through the day.
      int bx0 = sx0() + 10;
      int bx1 = sx1() - 10;
      int by = y + 86;
      g.fill(bx0, by, bx1, by + 6, 0xFF333A4A);
      g.fill(bx0, by, bx0 + (int) ((bx1 - bx0) * ((dayTime + 6000) % 24000L) / 24000L), by + 6, 0xFFF2C94C);
      small(g, "0:00", bx0, by + 9, 0xFF8899AA);
      small(g, "24:00", bx1 - 22, by + 9, 0xFF8899AA);
   }

   private void drawWeather(GuiGraphics g) {
      header(g, App.WEATHER);
      ClientLevel level = minecraft.level;
      LocalPlayer p = minecraft.player;
      if (level == null || p == null) {
         return;
      }
      BlockPos pos = p.blockPosition();
      Holder<Biome> biome = level.getBiome(pos);
      boolean rain = level.isRaining();
      boolean thunder = level.isThundering();
      boolean snow = rain && biome.value().coldEnoughToSnow(pos);
      boolean dry = !biome.value().hasPrecipitation();
      String icon;
      String key;
      if (thunder && !dry) {
         icon = "⚡";
         key = "thunder";
      } else if (rain && !dry) {
         icon = snow ? "❄" : "☂";
         key = snow ? "snow" : "rain";
      } else {
         icon = "☀";
         key = "clear";
      }
      int cx = (sx0() + sx1()) / 2;
      int y = contentTop() + 14;
      g.pose().pushPose();
      g.pose().translate(cx, y, 0);
      g.pose().scale(4f, 4f, 1f);
      g.drawCenteredString(font, icon, 0, 0, 0xFFFFE08A);
      g.pose().popPose();
      g.drawCenteredString(font, Component.translatable("phone.citybuilder.weather." + key), cx, y + 42, 0xFFFFFFFF);
      float temp = biome.value().getBaseTemperature();
      int celsius = Math.round(temp * 25 - (pos.getY() > 80 ? (pos.getY() - 80) / 10f : 0));
      g.drawCenteredString(font, Component.translatable("phone.citybuilder.temperature", celsius), cx, y + 58, 0xFFDDE6F5);
      g.drawCenteredString(font, biomeName(level, pos), cx, y + 72, 0xFFB8E0B8);
      if (pos.getY() < level.getSeaLevel() - 10 && !level.canSeeSky(pos)) {
         g.drawCenteredString(font, Component.translatable("phone.citybuilder.underground"), cx, y + 90, 0xFF999999);
      }
   }

   private void drawStatus(GuiGraphics g) {
      header(g, App.STATUS);
      LocalPlayer p = minecraft.player;
      if (p == null) {
         return;
      }
      int x = sx0() + 8;
      int y = contentTop() + 6;
      int w = sx1() - sx0() - 16;
      g.drawString(font, p.getName(), x, y, 0xFFFFFFFF, false);
      y += 16;
      bar(g, x, y, w, p.getHealth() / p.getMaxHealth(), 0xFFEB5757,
            Component.translatable("phone.citybuilder.health", Math.round(p.getHealth()), Math.round(p.getMaxHealth())));
      y += 24;
      bar(g, x, y, w, p.getFoodData().getFoodLevel() / 20f, 0xFFF2994A,
            Component.translatable("phone.citybuilder.food", p.getFoodData().getFoodLevel()));
      y += 24;
      bar(g, x, y, w, p.experienceProgress, 0xFF6FCF97, Component.translatable("phone.citybuilder.level", p.experienceLevel));
      y += 24;
      bar(g, x, y, w, p.getArmorValue() / 20f, 0xFF56CCF2, Component.translatable("phone.citybuilder.armor", p.getArmorValue()));
      y += 26;
      GameType mode = minecraft.gameMode != null ? minecraft.gameMode.getPlayerMode() : GameType.SURVIVAL;
      g.drawString(font, Component.translatable("phone.citybuilder.mode", mode.getLongDisplayName()), x, y, 0xFFDDE6F5, false);
      g.drawString(font, Component.translatable("phone.citybuilder.effects", p.getActiveEffects().size()), x, y + 12, 0xFFDDE6F5, false);
   }

   private void bar(GuiGraphics g, int x, int y, int w, float frac, int color, Component label) {
      small(g, label.getString(), x, y, 0xFFDDE6F5);
      g.fill(x, y + 10, x + w, y + 16, 0xFF333A4A);
      g.fill(x, y + 10, x + (int) (w * Mth.clamp(frac, 0f, 1f)), y + 16, color);
   }

   private void drawCompass(GuiGraphics g) {
      header(g, App.COMPASS);
      LocalPlayer p = minecraft.player;
      ClientLevel level = minecraft.level;
      if (p == null || level == null) {
         return;
      }
      int cx = (sx0() + sx1()) / 2;
      int cy = contentTop() + 52;
      int r = 40;
      // Dial ring.
      for (int a = 0; a < 360; a += 6) {
         float rad = a * Mth.DEG_TO_RAD;
         int px = cx + Math.round(Mth.cos(rad) * r);
         int py = cy + Math.round(Mth.sin(rad) * r);
         g.fill(px - 1, py - 1, px + 1, py + 1, a % 90 == 0 ? 0xFFFFFFFF : 0xFF667788);
      }
      // Rotate the cardinal letters so "up" on the dial is where the player looks.
      float yaw = Mth.wrapDegrees(p.getYRot());
      String[] names = {"S", "W", "N", "E"};
      for (int i = 0; i < 4; i++) {
         float ang = (i * 90 - yaw - 90) * Mth.DEG_TO_RAD;
         int px = cx + Math.round(Mth.cos(ang) * (r - 10));
         int py = cy + Math.round(Mth.sin(ang) * (r - 10));
         g.drawCenteredString(font, names[i], px, py - 4, names[i].equals("N") ? 0xFFFF5555 : 0xFFFFFFFF);
      }
      g.fill(cx - 1, cy - r + 2, cx + 1, cy - 4, 0xFFFF5555);
      int deg = Math.round((yaw + 360) % 360);
      g.drawCenteredString(font, Component.translatable("phone.citybuilder.heading", facing(deg), deg), cx, cy + r + 6, 0xFFFFFFFF);

      int y = cy + r + 22;
      BlockPos pos = p.blockPosition();
      BlockPos spawn = level.getSharedSpawnPos();
      small(g, Component.translatable("phone.citybuilder.spawn", dist(pos, spawn), facing(bearing(pos, spawn))).getString(), sx0() + 6, y, 0xFFDDE6F5);
      Optional<GlobalPos> death = p.getLastDeathLocation();
      if (death.isPresent() && death.get().dimension().equals(level.dimension())) {
         BlockPos d = death.get().pos();
         small(g, Component.translatable("phone.citybuilder.death", dist(pos, d), facing(bearing(pos, d))).getString(), sx0() + 6, y + 11, 0xFFFF9A9A);
      }
   }

   private void drawHelp(GuiGraphics g) {
      header(g, App.HELP);
      List<String> lines = List.of(
            "/city <preset> ~ ~ ~ <2-8>",
            "  downtown shibuya shitamachi",
            "  residential mixed",
            "/skyscraper <type> ~ ~ ~ w d f h",
            "/base <type> ~ ~ ~ <size>",
            "/road <type> ~ ~ ~ <len> x|z",
            "/rail <type> ~ ~ ~ <len> x|z",
            "/station <type> ~ ~ ~ <len> x|z",
            "/plane <type> ~ ~ ~ <facing>",
            "/cb undo",
            "/cb cancel",
            "/cb status");
      int y = contentTop() + 2;
      for (String line : lines) {
         small(g, line, sx0() + 4, y, line.startsWith(" ") ? 0xFF99AABB : 0xFFFFFFFF);
         y += 10;
      }
      small(g, Component.translatable("phone.citybuilder.help_tab").getString(), sx0() + 4, y + 4, 0xFFF2C94C);
   }

   private void small(GuiGraphics g, String s, int x, int y, int color) {
      g.pose().pushPose();
      g.pose().translate(x, y, 0);
      g.pose().scale(0.75f, 0.75f, 1f);
      g.drawString(font, s, 0, 0, color, false);
      g.pose().popPose();
   }

   private static String gameTime(ClientLevel level) {
      long t = (level.getDayTime() + 6000L) % 24000L;
      int hour = (int) (t / 1000L);
      int minute = (int) (t % 1000L * 60L / 1000L);
      return String.format(java.util.Locale.ROOT, "%02d:%02d", hour, minute);
   }

   private static Component biomeName(ClientLevel level, BlockPos pos) {
      Optional<ResourceKey<Biome>> key = level.getBiome(pos).unwrapKey();
      return key.<Component>map(k -> Component.translatable("biome." + k.location().getNamespace() + "." + k.location().getPath()))
            .orElse(Component.literal("?"));
   }

   private static int dist(BlockPos a, BlockPos b) {
      return (int) Math.round(Math.sqrt(Math.pow(a.getX() - b.getX(), 2) + Math.pow(a.getZ() - b.getZ(), 2)));
   }

   /** Bearing in Minecraft yaw degrees (0 = south, 90 = west). */
   private static int bearing(BlockPos from, BlockPos to) {
      double ang = Math.toDegrees(Math.atan2(-(to.getX() - from.getX()), to.getZ() - from.getZ()));
      return (int) Math.round((ang + 360) % 360);
   }

   private static Component facing(int yawDeg) {
      String[] keys = {"s", "sw", "w", "nw", "n", "ne", "e", "se"};
      int idx = Math.floorMod(Math.round(yawDeg / 45f), 8);
      return Component.translatable("phone.citybuilder.dir." + keys[idx]);
   }

   private boolean isHome(double mx, double my) {
      int hx = left + W / 2;
      int hy = top + H - 14;
      return Math.abs(mx - hx) <= 8 && Math.abs(my - hy) <= 8;
   }

   @Override
   public boolean mouseClicked(double mx, double my, int button) {
      if (button == 0) {
         if (isHome(mx, my)) {
            open(App.HOME);
            return true;
         }
         if (app == App.HOME) {
            App[] apps = homeApps();
            for (int i = 0; i < apps.length; i++) {
               int[] r = iconRect(i);
               if (mx >= r[0] && mx < r[2] && my >= r[1] && my < r[3] + 10) {
                  open(apps[i]);
                  return true;
               }
            }
         } else {
            int y = sy0() + 13;
            if (my >= y && my < y + 14 && mx >= sx0() && mx < sx0() + 20) {
               open(App.HOME);
               return true;
            }
         }
      }
      return super.mouseClicked(mx, my, button);
   }

   private void open(App next) {
      app = next;
      mapCenter = null;
      Minecraft.getInstance().getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.UI_BUTTON_CLICK.value(), 1.6f, 0.4f));
   }
}
