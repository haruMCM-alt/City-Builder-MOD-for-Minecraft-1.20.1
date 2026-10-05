package com.example.citybuilder.builders;

import static com.example.citybuilder.builders.Plot.air;
import static com.example.citybuilder.builders.Plot.s;
import static com.example.citybuilder.builders.Plot.slab;
import static com.example.citybuilder.builders.Plot.stairs;
import static com.example.citybuilder.builders.Plot.stairsTop;

import com.example.citybuilder.engine.BlockCanvas;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

/**
 * High-rise towers. The footprint is (x, z) .. (x + width - 1, z + depth - 1) with the entrance on
 * the north side. Every tower has a lobby, an elevator core with a stop on each floor, furnished
 * floors, an emergency ladder and a crown.
 */
public final class SkyscraperBuilder {
   private SkyscraperBuilder() {
   }

   /** Wall pattern of a tower: which block goes at offset {@code u} along a face, {@code h} above the floor. */
   private interface Skin {
      BlockState at(int u, int h, int fh, int floor);
   }

   public static void build(BlockCanvas level, SkyscraperBuilder.Type type, int x, int y, int z, int width, int depth, int floors, int floorHeight) {
      int w = Math.max(7, width);
      int d = Math.max(7, depth);
      int f = Math.max(3, floors);
      int fh = Math.max(3, floorHeight);
      Plot p = new Plot(level, x, y, z);
      p.clear(-2, 1, -3, w + 1, f * fh + 30, d + 1);
      switch (type) {
         case MODERN -> modern(p, w, d, f, fh);
         case TWIN -> twin(p, w, d, f, fh);
         case PYRAMID -> pyramid(p, w, d, f, fh);
         case RESIDENTIAL -> residential(p, w, d, f, fh);
         case HOTEL -> hotel(p, w, d, f, fh);
         case GOOGLE -> google(p, w, d, f, fh);
      }
      // Paving round the base and a plinth to the ground.
      for (int i = -2; i <= w + 1; i++) {
         for (int j = -3; j <= d + 1; j++) {
            if (p.get(i, 0, j).isAir()) {
               p.set(i, 0, j, s(Blocks.SMOOTH_STONE));
            }
            BuildUtil.foundation(level, x + i, y - 1, z + j, s(Blocks.STONE_BRICKS));
         }
      }
   }

   public static void build(BlockCanvas level, int x, int y, int z, int width, int depth, int floors, int floorHeight) {
      build(level, SkyscraperBuilder.Type.MODERN, x, y, z, width, depth, floors, floorHeight);
   }

   // ------------------------------------------------------------------ shared parts

   /** One storey: floor slab at {@code fy} and the four walls drawn by {@code skin}. */
   private static void storey(Plot p, int i1, int j1, int i2, int j2, int fy, int fh, BlockState floor, Skin skin, int index) {
      p.fill(i1, fy, j1, i2, fy, j2, floor);
      for (int h = 1; h < fh; h++) {
         for (int i = i1; i <= i2; i++) {
            p.set(i, fy + h, j1, skin.at(i - i1, h, fh, index));
            p.set(i, fy + h, j2, skin.at(i - i1, h, fh, index));
         }
         for (int j = j1 + 1; j < j2; j++) {
            p.set(i1, fy + h, j, skin.at(j - j1, h, fh, index));
            p.set(i2, fy + h, j, skin.at(j - j1, h, fh, index));
         }
      }
   }

   /** Ceiling lights let into the slab above, avoiding the core. */
   private static void lights(Plot p, int i1, int j1, int i2, int j2, int h, int ci, int cj) {
      for (int i = i1 + 2; i <= i2 - 2; i += 4) {
         for (int j = j1 + 2; j <= j2 - 2; j += 4) {
            if (Math.abs(i - ci) > 2 || Math.abs(j - cj) > 2) {
               p.set(i, h, j, s(Blocks.SEA_LANTERN));
            }
         }
      }
   }

   /** Office furniture: rows of desks with screens and chairs, a meeting table and plants. */
   private static void offices(Plot p, int i1, int j1, int i2, int j2, int fy, int ci, int cj, Block desk, Block carpet) {
      p.fill(i1 + 1, fy, j1 + 1, i2 - 1, fy, j2 - 1, s(carpet));
      for (int i = i1 + 2; i <= i2 - 2; i += 3) {
         for (int j = j1 + 2; j <= j2 - 3; j += 3) {
            if (Math.abs(i - ci) <= 2 && Math.abs(j - cj) <= 2) {
               continue;
            }
            p.set(i, fy + 1, j, stairsTop(desk, Direction.NORTH));
            p.set(i, fy + 2, j, s(Blocks.BLACK_STAINED_GLASS_PANE));
            p.set(i, fy + 1, j + 1, stairs(Blocks.SPRUCE_STAIRS, Direction.SOUTH));
         }
      }
      p.set(i1 + 1, fy + 1, j1 + 1, s(Blocks.POTTED_FERN));
      p.set(i2 - 1, fy + 1, j2 - 1, s(Blocks.POTTED_BAMBOO));
   }

   /** Elevator stops on every floor plus a lobby stop, and an emergency ladder in a corner. */
   private static void core(Plot p, int ci, int cj, int floors, int fh, int lobbyTop, int roofY, int li, int lj) {
      for (int f = 0; f < floors; f++) {
         int fy = f * fh;
         Facilities.elevatorHall(p.l, p.x + ci, p.y + fy, p.z + cj, p.y + fy + fh);
      }
      Facilities.elevatorHall(p.l, p.x + ci, p.y + roofY, p.z + cj, p.y + roofY + 3);
      p.ladder(li, lj, 1, roofY - 1, Direction.NORTH);
   }

   /** Ground-floor lobby: glazing, entrance, reception desk and a canopy over the door. */
   private static void lobby(Plot p, int i1, int j1, int i2, int j2, int lobbyH, BlockState frame, BlockState canopy) {
      int mid = (i1 + i2) / 2;
      p.fill(i1 + 1, 0, j1 + 1, i2 - 1, 0, j2 - 1, s(Blocks.POLISHED_DIORITE));
      for (int h = 1; h < lobbyH; h++) {
         for (int i = i1; i <= i2; i++) {
            boolean pier = (i - i1) % 4 == 0 || i == i2;
            p.set(i, h, j1, pier ? frame : s(Blocks.GLASS));
         }
      }
      p.clear(mid - 1, 1, j1, mid + 1, 3, j1);
      p.fill(mid - 3, lobbyH - 1, j1 - 3, mid + 3, lobbyH - 1, j1 - 1, canopy);
      p.set(mid - 3, lobbyH - 2, j1 - 3, s(Blocks.IRON_BARS));
      p.set(mid + 3, lobbyH - 2, j1 - 3, s(Blocks.IRON_BARS));
      for (int h = 1; h < lobbyH - 1; h++) {
         p.set(mid - 3, h, j1 - 3, s(Blocks.IRON_BARS));
         p.set(mid + 3, h, j1 - 3, s(Blocks.IRON_BARS));
      }
      // Reception desk and planters.
      for (int i = mid - 2; i <= mid + 2; i++) {
         p.set(i, 1, j1 + 3, s(Blocks.SMOOTH_QUARTZ));
      }
      p.set(i1 + 1, 1, j1 + 1, s(Blocks.POTTED_AZALEA));
      p.set(i2 - 1, 1, j1 + 1, s(Blocks.POTTED_AZALEA));
   }

   /** Plant-room crown with louvres, a helipad or an antenna, and red obstruction lights. */
   private static void crown(Plot p, int i1, int j1, int i2, int j2, int y, BlockState roof, BlockState louvre, boolean helipad, int antenna) {
      p.fill(i1, y, j1, i2, y, j2, roof);
      p.ring(i1, y + 1, j1, i2, j2, s(Blocks.IRON_BARS));
      int ci = (i1 + i2) / 2;
      int cj = (j1 + j2) / 2;
      if (helipad && i2 - i1 >= 10 && j2 - j1 >= 10) {
         for (int i = i1 + 2; i <= i2 - 2; i++) {
            for (int j = j1 + 2; j <= j2 - 2; j++) {
               int di = i - ci;
               int dj = j - cj;
               int r2 = di * di + dj * dj;
               int r = Math.min(i2 - i1, j2 - j1) / 2 - 2;
               if (r2 <= r * r) {
                  p.set(i, y, j, (r2 >= (r - 1) * (r - 1)) ? s(Blocks.YELLOW_CONCRETE) : s(Blocks.GRAY_CONCRETE));
               }
            }
         }
         // The "H".
         for (int dj = -2; dj <= 2; dj++) {
            p.set(ci - 2, y, cj + dj, s(Blocks.WHITE_CONCRETE));
            p.set(ci + 2, y, cj + dj, s(Blocks.WHITE_CONCRETE));
         }
         p.set(ci - 1, y, cj, s(Blocks.WHITE_CONCRETE));
         p.set(ci, y, cj, s(Blocks.WHITE_CONCRETE));
         p.set(ci + 1, y, cj, s(Blocks.WHITE_CONCRETE));
      } else {
         int mi1 = i1 + 2;
         int mi2 = i2 - 2;
         int mj1 = j1 + 2;
         int mj2 = j2 - 2;
         if (mi2 - mi1 >= 2 && mj2 - mj1 >= 2) {
            for (int h = 1; h <= 3; h++) {
               p.ring(mi1, y + h, mj1, mi2, mj2, h == 2 ? louvre : roof);
            }
            p.fill(mi1, y + 4, mj1, mi2, y + 4, mj2, roof);
         }
      }
      if (antenna > 0) {
         int base = helipad ? y + 1 : y + 5;
         int ai = helipad ? i1 + 1 : ci;
         int aj = helipad ? j1 + 1 : cj;
         p.fill(ai, base, aj, ai, base + antenna, aj, s(Blocks.IRON_BARS));
         p.set(ai, base + antenna + 1, aj, s(Blocks.REDSTONE_LAMP));
      }
      for (int[] c : new int[][]{{i1, j1}, {i2, j1}, {i1, j2}, {i2, j2}}) {
         p.set(c[0], y + 2, c[1], s(Blocks.REDSTONE_LAMP));
      }
   }

   private static void terrace(Plot p, int i1, int j1, int i2, int j2, int y, int ii1, int ij1, int ii2, int ij2) {
      for (int i = i1; i <= i2; i++) {
         for (int j = j1; j <= j2; j++) {
            boolean inside = i >= ii1 && i <= ii2 && j >= ij1 && j <= ij2;
            if (!inside) {
               boolean edge = i == i1 || i == i2 || j == j1 || j == j2;
               p.set(i, y, j, s(Blocks.SMOOTH_STONE));
               if (edge) {
                  p.set(i, y + 1, j, s(Blocks.GLASS_PANE));
               } else if ((i + j) % 5 == 0) {
                  p.set(i, y, j, s(Blocks.GRASS_BLOCK));
                  p.set(i, y + 1, j, s(Blocks.AZALEA));
               }
            }
         }
      }
   }

   // ------------------------------------------------------------------ modern: set-back glass tower

   private static void modern(Plot p, int w, int d, int f, int fh) {
      officeTower(p, w, d, f, fh, s(Blocks.LIGHT_BLUE_STAINED_GLASS), s(Blocks.LIGHT_GRAY_CONCRETE), s(Blocks.POLISHED_DEEPSLATE),
            Blocks.BIRCH_STAIRS, Blocks.GRAY_WOOL, true);
   }

   private static void google(Plot p, int w, int d, int f, int fh) {
      officeTower(p, w, d, f, fh, s(Blocks.GLASS), s(Blocks.WHITE_CONCRETE), s(Blocks.WHITE_CONCRETE), Blocks.BIRCH_STAIRS, Blocks.WHITE_WOOL, false);
      // Colourful accents: coloured fins on the front, colourful floors and a logo over the entrance.
      Block[] colours = {Blocks.BLUE_CONCRETE, Blocks.RED_CONCRETE, Blocks.YELLOW_CONCRETE, Blocks.BLUE_CONCRETE, Blocks.GREEN_CONCRETE, Blocks.RED_CONCRETE};
      int lobbyH = Math.max(fh, 5);
      int mid = (w - 1) / 2;
      for (int k = 0; k < colours.length; k++) {
         p.set(mid - 3 + k, lobbyH, -1, s(colours[k]));
         p.set(mid - 3 + k, lobbyH + 1, -1, s(colours[k]));
      }
      Block[] carpets = {Blocks.BLUE_WOOL, Blocks.RED_WOOL, Blocks.YELLOW_WOOL, Blocks.GREEN_WOOL};
      for (int fl = 1; fl < f; fl++) {
         int fy = lobbyH + (fl - 1) * fh;
         int inset = setback(fl, f);
         for (int i = inset + 1; i < w - 1 - inset; i++) {
            for (int j = inset + 1; j < d - 1 - inset; j++) {
               if (p.get(i, fy, j).is(Blocks.WHITE_WOOL)) {
                  p.set(i, fy, j, s(carpets[Math.floorMod(i / 3 + j / 3 + fl, carpets.length)]));
               }
            }
         }
         // Glass meeting box in one corner.
         int mi = inset + 2;
         int mj = inset + 2;
         if (w - 2 * inset > 10) {
            p.walls(mi, fy + 1, mj, mi + 3, fy + 3, mj + 3, s(Blocks.WHITE_STAINED_GLASS));
            p.clear(mi + 1, fy + 1, mj + 3, mi + 1, fy + 2, mj + 3);
            p.set(mi + 1, fy + 1, mj + 1, s(Blocks.OAK_PLANKS));
            p.set(mi + 2, fy + 1, mj + 1, s(Blocks.OAK_PLANKS));
         }
      }
      for (int fl = 1; fl < f; fl += 3) {
         int fy = lobbyH + (fl - 1) * fh;
         int inset = setback(fl, f);
         for (int h = 1; h < fh; h++) {
            p.set(inset + 1, fy + h, inset - 0, s(colours[fl % colours.length]));
         }
      }
   }

   /** 0 for the lower third, 1 for the middle third, 2 for the top third. */
   private static int setback(int floor, int floors) {
      return floor * 3 / Math.max(1, floors);
   }

   private static void officeTower(Plot p, int w, int d, int f, int fh, BlockState glass, BlockState spandrel, BlockState fin,
                                   Block desk, Block carpet, boolean spire) {
      int lobbyH = Math.max(fh, 5);
      int ci = (w - 1) / 2;
      int cj = (d - 1) / 2;
      Skin skin = (u, h, hgt, floor) -> {
         if (u % 3 == 0) {
            return fin;
         }
         return h == 1 ? spandrel : glass;
      };
      // Podium lobby.
      storey(p, 0, 0, w - 1, d - 1, 0, lobbyH, s(Blocks.POLISHED_DIORITE), (u, h, hgt, fl) -> u % 4 == 0 ? fin : s(Blocks.GLASS), 0);
      lobby(p, 0, 0, w - 1, d - 1, lobbyH, fin, slab(Blocks.SMOOTH_STONE_SLAB));
      int lastInset = 0;
      for (int fl = 1; fl < f; fl++) {
         int fy = lobbyH + (fl - 1) * fh;
         int inset = setback(fl, f);
         if (inset != lastInset) {
            terrace(p, lastInset, lastInset, w - 1 - lastInset, d - 1 - lastInset, fy, inset, inset, w - 1 - inset, d - 1 - inset);
            lastInset = inset;
         }
         storey(p, inset, inset, w - 1 - inset, d - 1 - inset, fy, fh, s(Blocks.LIGHT_GRAY_CONCRETE), skin, fl);
         offices(p, inset, inset, w - 1 - inset, d - 1 - inset, fy, ci, cj, desk, carpet);
         lights(p, inset, inset, w - 1 - inset, d - 1 - inset, fy + fh, ci, cj);
      }
      int roofY = lobbyH + (f - 1) * fh;
      int inset = lastInset;
      crown(p, inset, inset, w - 1 - inset, d - 1 - inset, roofY, s(Blocks.GRAY_CONCRETE), s(Blocks.IRON_BARS), !spire, spire ? 12 : 4);
      core(p, ci, cj, 0, fh, lobbyH, roofY, w - 3 - inset, d - 2 - inset);
      Facilities.elevatorHall(p.l, p.x + ci, p.y, p.z + cj, p.y + 3);
      for (int fl = 1; fl < f; fl++) {
         int fy = lobbyH + (fl - 1) * fh;
         Facilities.elevatorHall(p.l, p.x + ci, p.y + fy, p.z + cj, p.y + fy + fh);
      }
   }

   // ------------------------------------------------------------------ twin towers with a sky bridge

   private static void twin(Plot p, int w, int d, int f, int fh) {
      int tw = Math.max(7, (w - 3) / 2);
      int gap = Math.max(3, w - 2 * tw);
      int bx = tw + gap;
      int lobbyH = Math.max(fh, 5);
      BlockState glass = s(Blocks.GRAY_STAINED_GLASS);
      BlockState frame = s(Blocks.BLACK_CONCRETE);
      BlockState steel = s(Blocks.POLISHED_DEEPSLATE);
      // Shared podium.
      storey(p, 0, 0, bx + tw - 1, d - 1, 0, lobbyH, s(Blocks.POLISHED_DIORITE), (u, h, hgt, fl) -> u % 4 == 0 ? steel : s(Blocks.GLASS), 0);
      lobby(p, 0, 0, bx + tw - 1, d - 1, lobbyH, steel, slab(Blocks.POLISHED_DEEPSLATE_SLAB));
      p.fill(0, lobbyH, 0, bx + tw - 1, lobbyH, d - 1, s(Blocks.SMOOTH_STONE));
      Skin skin = (u, h, hgt, floor) -> u % 2 == 0 ? frame : (h == 1 ? steel : glass);
      int bridge = Math.max(2, f * 2 / 3);
      for (int t = 0; t < 2; t++) {
         int ox = t == 0 ? 0 : bx;
         int ci = ox + (tw - 1) / 2;
         int cj = (d - 1) / 2;
         for (int fl = 1; fl < f; fl++) {
            int fy = lobbyH + (fl - 1) * fh;
            storey(p, ox, 0, ox + tw - 1, d - 1, fy, fh, s(Blocks.LIGHT_GRAY_CONCRETE), skin, fl);
            offices(p, ox, 0, ox + tw - 1, d - 1, fy, ci, cj, Blocks.DARK_OAK_STAIRS, Blocks.GRAY_WOOL);
            lights(p, ox, 0, ox + tw - 1, d - 1, fy + fh, ci, cj);
            Facilities.elevatorHall(p.l, p.x + ci, p.y + fy, p.z + cj, p.y + fy + fh);
         }
         int roofY = lobbyH + (f - 1) * fh;
         // Tapered crown and a needle on each tower.
         p.fill(ox, roofY, 0, ox + tw - 1, roofY, d - 1, frame);
         p.hip(ox + 1, 1, ox + tw - 2, d - 2, roofY + 1, Blocks.POLISHED_DEEPSLATE_STAIRS, s(Blocks.POLISHED_DEEPSLATE), 0);
         p.fill(ci, roofY + 1, cj, ci, roofY + 14, cj, s(Blocks.IRON_BARS));
         p.set(ci, roofY + 15, cj, s(Blocks.REDSTONE_LAMP));
         Facilities.elevatorHall(p.l, p.x + ci, p.y, p.z + cj, p.y + 3);
         p.ladder(ox + tw - 2, d - 2, lobbyH + 1, roofY - 1, Direction.NORTH);
      }
      // Two-storey sky bridge.
      int by = lobbyH + (bridge - 1) * fh;
      int bj1 = Math.max(1, d / 2 - 2);
      int bj2 = Math.min(d - 2, d / 2 + 2);
      p.fill(tw, by, bj1, bx - 1, by, bj2, s(Blocks.LIGHT_GRAY_CONCRETE));
      p.fill(tw, by + fh, bj1, bx - 1, by + fh, bj2, steel);
      for (int i = tw; i < bx; i++) {
         for (int h = 1; h < fh; h++) {
            p.set(i, by + h, bj1, glass);
            p.set(i, by + h, bj2, glass);
         }
         p.fill(i, by + 1, bj1 + 1, i, by + fh - 1, bj2 - 1, air());
      }
      p.clear(tw - 1, by + 1, bj1 + 1, tw - 1, by + 2, bj2 - 1);
      p.clear(bx, by + 1, bj1 + 1, bx, by + 2, bj2 - 1);
      // Diagonal struts under the bridge.
      for (int k = 1; k <= Math.min(gap / 2, 3); k++) {
         p.set(tw - 1 + k, by - k, bj1, frame);
         p.set(bx - k, by - k, bj1, frame);
         p.set(tw - 1 + k, by - k, bj2, frame);
         p.set(bx - k, by - k, bj2, frame);
      }
   }

   // ------------------------------------------------------------------ pyramid: tapering spire tower

   private static void pyramid(Plot p, int w, int d, int f, int fh) {
      int lobbyH = Math.max(fh, 5);
      BlockState white = s(Blocks.WHITE_CONCRETE);
      BlockState glass = s(Blocks.LIGHT_BLUE_STAINED_GLASS);
      int ci = (w - 1) / 2;
      int cj = (d - 1) / 2;
      int minHalf = 2;
      storey(p, 0, 0, w - 1, d - 1, 0, lobbyH, s(Blocks.POLISHED_DIORITE), (u, h, hgt, fl) -> u % 3 == 0 ? white : s(Blocks.GLASS), 0);
      lobby(p, 0, 0, w - 1, d - 1, lobbyH, white, slab(Blocks.QUARTZ_SLAB));
      Skin skin = (u, h, hgt, floor) -> (u % 2 == 1 && h == 2) || (u % 2 == 1 && h > 1 && h < hgt - 1) ? glass : white;
      int roofY = lobbyH;
      int lastI = 0;
      int lastJ = 0;
      for (int fl = 1; fl < f; fl++) {
         int fy = lobbyH + (fl - 1) * fh;
         // Each face leans in steadily so the tower ends as a narrow point.
         double t = (double) fl / f;
         int insetI = (int) Math.round(t * (ci - minHalf));
         int insetJ = (int) Math.round(t * (cj - minHalf));
         int i1 = insetI;
         int i2 = w - 1 - insetI;
         int j1 = insetJ;
         int j2 = d - 1 - insetJ;
         if (insetI != lastI || insetJ != lastJ) {
            // Fill the ledge left by the step with a sloped band.
            for (int i = lastI; i <= w - 1 - lastI; i++) {
               for (int j = lastJ; j <= d - 1 - lastJ; j++) {
                  if (i < i1 || i > i2 || j < j1 || j > j2) {
                     p.set(i, fy, j, white);
                  }
               }
            }
            lastI = insetI;
            lastJ = insetJ;
         }
         storey(p, i1, j1, i2, j2, fy, fh, s(Blocks.LIGHT_GRAY_CONCRETE), skin, fl);
         if (i2 - i1 >= 6 && j2 - j1 >= 6) {
            offices(p, i1, j1, i2, j2, fy, ci, cj, Blocks.BIRCH_STAIRS, Blocks.LIGHT_GRAY_WOOL);
         }
         lights(p, i1, j1, i2, j2, fy + fh, ci, cj);
         Facilities.elevatorShaftStop(p.l, p.x + ci, p.y + fy, p.z + cj, p.y + fy + fh);
         roofY = fy + fh;
      }
      Facilities.elevatorShaftStop(p.l, p.x + ci, p.y, p.z + cj, p.y + 3);
      // Spire.
      p.fill(lastI, roofY, lastJ, w - 1 - lastI, roofY, d - 1 - lastJ, white);
      int top = p.hip(lastI, lastJ, w - 1 - lastI, d - 1 - lastJ, roofY + 1, Blocks.QUARTZ_STAIRS, s(Blocks.QUARTZ_BLOCK), 0);
      p.fill(ci, top + 1, cj, ci, top + 10, cj, s(Blocks.IRON_BARS));
      p.set(ci, top + 11, cj, s(Blocks.REDSTONE_LAMP));
   }

   // ------------------------------------------------------------------ residential tower (tower mansion)

   private static void residential(Plot p, int w, int d, int f, int fh) {
      int lobbyH = Math.max(fh, 5);
      int ci = (w - 1) / 2;
      int cj = (d - 1) / 2;
      BlockState concrete = s(Blocks.WHITE_CONCRETE);
      BlockState warm = s(Blocks.LIGHT_GRAY_CONCRETE);
      storey(p, 0, 0, w - 1, d - 1, 0, lobbyH, s(Blocks.POLISHED_DIORITE), (u, h, hgt, fl) -> u % 4 == 0 ? warm : s(Blocks.GLASS), 0);
      lobby(p, 0, 0, w - 1, d - 1, lobbyH, warm, slab(Blocks.SMOOTH_STONE_SLAB));
      // The tower sits one block in from the podium so balconies can wrap round it.
      int i1 = 1;
      int j1 = 1;
      int i2 = w - 2;
      int j2 = d - 2;
      Skin skin = (u, h, hgt, floor) -> {
         if (u % 4 == 0) {
            return concrete;
         }
         if (h == 1) {
            return warm;
         }
         return (u + floor) % 7 == 0 ? s(Blocks.LIGHT_GRAY_STAINED_GLASS) : s(Blocks.GLASS);
      };
      int roofY = lobbyH;
      for (int fl = 1; fl < f; fl++) {
         int fy = lobbyH + (fl - 1) * fh;
         storey(p, i1, j1, i2, j2, fy, fh, concrete, skin, fl);
         // Continuous balconies with glass rails.
         p.ring(0, fy, 0, w - 1, d - 1, concrete);
         p.ring(0, fy + 1, 0, w - 1, d - 1, s(Blocks.WHITE_STAINED_GLASS_PANE));
         // Flats: oak floors, partitions, beds, sofas, kitchens.
         p.fill(i1 + 1, fy, j1 + 1, i2 - 1, fy, j2 - 1, s(Blocks.OAK_PLANKS));
         for (int i = i1 + 5; i < i2; i += 5) {
            p.fill(i, fy + 1, j1 + 1, i, fy + fh - 1, cj - 2, s(Blocks.WHITE_CONCRETE));
            p.fill(i, fy + 1, cj + 2, i, fy + fh - 1, j2 - 1, s(Blocks.WHITE_CONCRETE));
         }
         for (int i = i1 + 2; i < i2 - 1; i += 5) {
            p.bed(i, fy + 1, j1 + 2, Blocks.LIGHT_GRAY_BED, Direction.NORTH);
            p.set(i + 1, fy + 1, j2 - 1, stairs(Blocks.BIRCH_STAIRS, Direction.SOUTH));
            p.set(i + 2, fy + 1, j2 - 1, s(Blocks.SMOKER).setValue(net.minecraft.world.level.block.AbstractFurnaceBlock.FACING, Direction.NORTH));
         }
         lights(p, i1, j1, i2, j2, fy + fh, ci, cj);
         Facilities.elevatorHall(p.l, p.x + ci, p.y + fy, p.z + cj, p.y + fy + fh);
         roofY = fy + fh;
      }
      Facilities.elevatorHall(p.l, p.x + ci, p.y, p.z + cj, p.y + 3);
      crown(p, i1, j1, i2, j2, roofY, concrete, s(Blocks.IRON_BARS), true, 6);
      Facilities.elevatorHall(p.l, p.x + ci, p.y + roofY, p.z + cj, p.y + roofY + 3);
      p.ladder(i2 - 1, j2 - 1, lobbyH + 1, roofY - 1, Direction.NORTH);
   }

   // ------------------------------------------------------------------ hotel

   private static void hotel(Plot p, int w, int d, int f, int fh) {
      int podiumFloors = 2;
      int lobbyH = Math.max(fh, 5);
      int ci = (w - 1) / 2;
      int cj = (d - 1) / 2;
      BlockState stone = s(Blocks.SMOOTH_SANDSTONE);
      BlockState dark = s(Blocks.DEEPSLATE_TILES);
      // Stone podium: lobby with chandeliers, then a banquet floor.
      storey(p, 0, 0, w - 1, d - 1, 0, lobbyH, s(Blocks.POLISHED_DIORITE), (u, h, hgt, fl) -> u % 3 == 0 ? stone : s(Blocks.GLASS), 0);
      lobby(p, 0, 0, w - 1, d - 1, lobbyH, stone, slab(Blocks.SMOOTH_SANDSTONE_SLAB));
      p.fill(1, 0, 1, w - 2, 0, d - 2, s(Blocks.RED_WOOL));
      for (int i = 3; i < w - 3; i += 5) {
         p.set(i, lobbyH - 1, cj, s(Blocks.LANTERN).setValue(net.minecraft.world.level.block.LanternBlock.HANGING, true));
      }
      int by = lobbyH;
      storey(p, 0, 0, w - 1, d - 1, by, fh, stone, (u, h, hgt, fl) -> u % 3 == 0 || h == 1 ? stone : s(Blocks.YELLOW_STAINED_GLASS), 1);
      p.fill(1, by, 1, w - 2, by, d - 2, s(Blocks.RED_WOOL));
      for (int i = 3; i < w - 3; i += 4) {
         for (int j = 3; j < d - 3; j += 4) {
            p.set(i, by + 1, j, s(Blocks.DARK_OAK_FENCE));
            p.set(i, by + 2, j, s(Blocks.WHITE_CARPET));
         }
      }
      // Guest-room tower above, set in from the podium.
      int i1 = 2;
      int j1 = 2;
      int i2 = w - 3;
      int j2 = d - 3;
      Skin skin = (u, h, hgt, floor) -> {
         if (u % 2 == 0) {
            return s(Blocks.QUARTZ_BLOCK);
         }
         return h == 1 ? dark : s(Blocks.GLASS_PANE);
      };
      int towerY = by + fh;
      terrace(p, 0, 0, w - 1, d - 1, towerY, i1, j1, i2, j2);
      int roofY = towerY;
      for (int fl = podiumFloors; fl < f; fl++) {
         int fy = towerY + (fl - podiumFloors) * fh;
         storey(p, i1, j1, i2, j2, fy, fh, s(Blocks.SMOOTH_QUARTZ), skin, fl);
         // Central corridor, rooms either side with a bed each.
         p.fill(i1 + 1, fy, cj, i2 - 1, fy, cj, s(Blocks.RED_WOOL));
         for (int i = i1 + 3; i < i2; i += 3) {
            p.fill(i, fy + 1, j1 + 1, i, fy + fh - 1, cj - 1, s(Blocks.SMOOTH_QUARTZ));
            p.fill(i, fy + 1, cj + 1, i, fy + fh - 1, j2 - 1, s(Blocks.SMOOTH_QUARTZ));
         }
         for (int i = i1 + 1; i < i2 - 1; i += 3) {
            if (cj - 1 > j1 + 2) {
               p.bed(i + 1, fy + 1, j1 + 2, Blocks.WHITE_BED, Direction.NORTH);
               p.door(i + 1, fy + 1, cj - 1, Blocks.DARK_OAK_DOOR, Direction.SOUTH);
            }
            if (cj + 1 < j2 - 2) {
               p.bed(i + 1, fy + 1, j2 - 2, Blocks.WHITE_BED, Direction.SOUTH);
               p.door(i + 1, fy + 1, cj + 1, Blocks.DARK_OAK_DOOR, Direction.NORTH);
            }
         }
         p.fill(i1 + 1, fy + 1, cj - 1, i1 + 1, fy + 2, cj + 1, air());
         for (int i = i1 + 2; i < i2; i += 4) {
            p.set(i, fy + fh, cj, s(Blocks.SEA_LANTERN));
         }
         Facilities.elevatorShaftStop(p.l, p.x + i2 - 1, p.y + fy, p.z + cj, p.y + fy + fh);
         roofY = fy + fh;
      }
      Facilities.elevatorShaftStop(p.l, p.x + i2 - 1, p.y, p.z + cj, p.y + 3);
      Facilities.elevatorShaftStop(p.l, p.x + i2 - 1, p.y + by, p.z + cj, p.y + by + 3);
      Facilities.elevatorShaftStop(p.l, p.x + i2 - 1, p.y + roofY, p.z + cj, p.y + roofY + 3);
      // Rooftop bar: glass pavilion with lights, and the hotel name.
      p.fill(i1, roofY, j1, i2, roofY, j2, dark);
      p.ring(i1, roofY + 1, j1, i2, j2, s(Blocks.GLASS_PANE));
      int bi1 = i1 + 2;
      int bi2 = Math.min(i2 - 3, bi1 + 6);
      int bj1 = j1 + 2;
      int bj2 = Math.min(j2 - 2, bj1 + 4);
      if (bi2 > bi1 + 2 && bj2 > bj1 + 2) {
         p.walls(bi1, roofY + 1, bj1, bi2, roofY + 3, bj2, s(Blocks.GLASS));
         p.fill(bi1, roofY + 4, bj1, bi2, roofY + 4, bj2, dark);
         p.clear(bi1 + 1, roofY + 1, bj2, bi1 + 1, roofY + 2, bj2);
         for (int i = bi1 + 1; i < bi2; i++) {
            p.set(i, roofY + 1, bj1 + 1, s(Blocks.DARK_OAK_PLANKS));
         }
         p.set(bi1 + 1, roofY + 2, bj1 + 1, s(Blocks.BREWING_STAND));
         p.set((bi1 + bi2) / 2, roofY + 3, (bj1 + bj2) / 2, s(Blocks.LANTERN).setValue(net.minecraft.world.level.block.LanternBlock.HANGING, true));
      }
      for (int i = i1; i <= i2; i++) {
         p.set(i, roofY + 2, j1, (i % 2 == 0) ? s(Blocks.OCHRE_FROGLIGHT) : s(Blocks.GLASS_PANE));
      }
      p.sign((w - 1) / 2, lobbyH, -1, Blocks.DARK_OAK_WALL_SIGN, Direction.NORTH,
            Component.empty(), Component.literal("GRAND HOTEL"), Component.literal("★★★★★"));
      p.set((w - 1) / 2, lobbyH, 0, stone);
      p.ladder(i1 + 1, j2 - 1, towerY + 1, roofY - 1, Direction.NORTH);
   }

   public static enum Type {
      MODERN,
      TWIN,
      PYRAMID,
      RESIDENTIAL,
      HOTEL,
      GOOGLE;
   }
}
