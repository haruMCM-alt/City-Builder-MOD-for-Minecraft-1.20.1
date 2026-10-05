package com.example.citybuilder.builders;

import com.example.citybuilder.config.CityBuilderConfig;
import com.example.citybuilder.engine.BlockCanvas;
import net.minecraft.core.BlockPos.MutableBlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.LadderBlock;
import net.minecraft.world.level.block.LanternBlock;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.WallSignBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.Half;
import net.minecraft.world.level.block.state.properties.SlabType;

public final class BuildUtil {
   private BuildUtil() {
   }

   public static void fill(BlockCanvas level, int x1, int y1, int z1, int x2, int y2, int z2, BlockState state) {
      int minX = Math.min(x1, x2);
      int maxX = Math.max(x1, x2);
      int minY = Math.min(y1, y2);
      int maxY = Math.max(y1, y2);
      int minZ = Math.min(z1, z2);
      int maxZ = Math.max(z1, z2);

      for (int x = minX; x <= maxX; x++) {
         for (int y = minY; y <= maxY; y++) {
            for (int z = minZ; z <= maxZ; z++) {
               level.set(x, y, z, state);
            }
         }
      }
   }

   public static void hollowBox(BlockCanvas level, int x1, int y1, int z1, int x2, int y2, int z2, BlockState wall) {
      int minX = Math.min(x1, x2);
      int maxX = Math.max(x1, x2);
      int minY = Math.min(y1, y2);
      int maxY = Math.max(y1, y2);
      int minZ = Math.min(z1, z2);
      int maxZ = Math.max(z1, z2);

      for (int x = minX; x <= maxX; x++) {
         for (int y = minY; y <= maxY; y++) {
            for (int z = minZ; z <= maxZ; z++) {
               boolean edge = x == minX || x == maxX || z == minZ || z == maxZ || y == minY || y == maxY;
               if (edge) {
                  level.set(x, y, z, wall);
               }
            }
         }
      }
   }

   public static void setBlock(BlockCanvas level, int x, int y, int z, BlockState state) {
      level.set(x, y, z, state);
   }

   public static BlockState air() {
      return Blocks.AIR.defaultBlockState();
   }

   public static int sign(int v) {
      return Integer.compare(v, 0);
   }

   /** Stairs whose climbing direction is {@code facing} (the player walks towards facing to go up). */
   public static BlockState stairs(Block stairs, Direction facing) {
      return stairs.defaultBlockState().setValue(StairBlock.FACING, facing);
   }

   /** Upside-down stairs, used for counters and eaves. */
   public static BlockState stairsTop(Block stairs, Direction facing) {
      return stairs(stairs, facing).setValue(StairBlock.HALF, Half.TOP);
   }

   public static BlockState topSlab(Block slab) {
      return slab.defaultBlockState().setValue(SlabBlock.TYPE, SlabType.TOP);
   }

   /** A complete door; {@code facing} points out of the building through the doorway. */
   public static void door(BlockCanvas l, int x, int y, int z, Block door, Direction facing) {
      l.set(x, y, z, door.defaultBlockState().setValue(DoorBlock.FACING, facing.getOpposite()));
   }

   /** A complete bed whose head lies one block towards {@code headDir}. */
   public static void bed(BlockCanvas l, int x, int y, int z, Block bed, Direction headDir) {
      l.set(x, y, z, bed.defaultBlockState().setValue(BedBlock.FACING, headDir));
   }

   /** A lantern that hangs from the block above it. */
   public static BlockState hangingLantern(Block lantern) {
      return lantern.defaultBlockState().setValue(LanternBlock.HANGING, true);
   }

   /**
    * A ladder column climbing from {@code y1} to {@code y2}, fixed to the wall on the side
    * opposite {@code facing}. Every block in the column (and the one above for headroom) is
    * cleared, so the column also cuts through any floors in the way.
    */
   public static void ladder(BlockCanvas l, int x, int z, int y1, int y2, Direction facing) {
      BlockState ladder = Blocks.LADDER.defaultBlockState().setValue(LadderBlock.FACING, facing);
      int wx = x - facing.getStepX();
      int wz = z - facing.getStepZ();
      for (int y = y1; y <= y2; y++) {
         l.set(x, y, z, ladder);
         BlockState wall = l.get(wx, y, wz);
         if (!wall.isFaceSturdy(l.level(), new net.minecraft.core.BlockPos(wx, y, wz), facing)) {
            l.set(wx, y, wz, Blocks.SMOOTH_STONE.defaultBlockState());
         }
      }
      l.set(x, y2 + 1, z, air());
      l.set(x, y2 + 2, z, air());
   }

   /** A wall sign hanging on the face {@code facing} of the block behind it, with up to four lines. */
   public static void wallSign(BlockCanvas l, int x, int y, int z, Block sign, Direction facing, Component... lines) {
      l.set(x, y, z, sign.defaultBlockState().setValue(WallSignBlock.FACING, facing));
      if (lines.length > 0) {
         l.signText(x, y, z, lines);
      }
   }

   /** Rotates a horizontal block state's FACING property if it has one. */
   public static BlockState facing(BlockState s, Direction d) {
      return s.hasProperty(BlockStateProperties.HORIZONTAL_FACING) ? s.setValue(BlockStateProperties.HORIZONTAL_FACING, d) : s;
   }

   /**
    * Extends a column downwards from {@code yTop} with {@code state} until it reaches solid
    * ground, so structures built over dips and slopes do not float.
    */
   public static void foundation(BlockCanvas l, int x, int yTop, int z, BlockState state) {
      int depth = CityBuilderConfig.foundationDepth();
      for (int i = 0; i < depth; i++) {
         int y = yTop - i;
         if (l.isSet(x, y, z)) {
            continue;
         }
         BlockState here = l.get(x, y, z);
         if (!here.canBeReplaced() && here.getFluidState().isEmpty()) {
            return;
         }
         l.set(x, y, z, state);
      }
   }

   /** Foundation under every column of a rectangle. */
   public static void foundation(BlockCanvas l, int x1, int yTop, int z1, int x2, int z2, BlockState state) {
      for (int x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
         for (int z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) {
            foundation(l, x, yTop, z, state);
         }
      }
   }

   /**
    * A square spiral staircase winding around a 1-block core at (cx, cz) from {@code y1} up to
    * {@code y2}, clearing headroom (including holes in any floors it passes through).
    */
   public static void spiralStair(BlockCanvas l, int cx, int cz, int y1, int y2, Block stairs, BlockState core) {
      // The eight cells around the core in walking order, each with the direction of travel.
      int[][] ring = {{-1, -1}, {0, -1}, {1, -1}, {1, 0}, {1, 1}, {0, 1}, {-1, 1}, {-1, 0}};
      Direction[] dir = {Direction.EAST, Direction.EAST, Direction.SOUTH, Direction.SOUTH,
            Direction.WEST, Direction.WEST, Direction.NORTH, Direction.NORTH};
      for (int y = y1; y <= y2 + 3; y++) {
         for (int[] c : ring) {
            l.set(cx + c[0], y, cz + c[1], air());
         }
         l.set(cx, y, cz, core);
      }
      int step = 0;
      for (int y = y1; y <= y2; y++, step++) {
         int k = step % 8;
         l.set(cx + ring[k][0], y, cz + ring[k][1], stairs(stairs, dir[k]));
      }
      // Landing: the cell after the last step is level with the top floor.
      int k = step % 8;
      l.set(cx + ring[k][0], y2, cz + ring[k][1], core);
   }

   public static void decorateBuilding(BlockCanvas l, int x1, int y1, int z1, int x2, int y2, int z2) {
      decorateBuilding(l, x1, y1, z1, x2, y2, z2, BuildUtil.RoofStyle.AUTO, true);
   }

   public static void decorateBuilding(BlockCanvas l, int x1, int y1, int z1, int x2, int y2, int z2, BuildUtil.RoofStyle roof) {
      decorateBuilding(l, x1, y1, z1, x2, y2, z2, roof, true);
   }

   public static void decorateBuilding(BlockCanvas l, int x1, int y1, int z1, int x2, int y2, int z2, BuildUtil.RoofStyle roof, boolean pilasters) {
      int minX = Math.min(x1, x2);
      int maxX = Math.max(x1, x2);
      int minY = Math.min(y1, y2);
      int maxY = Math.max(y1, y2);
      int minZ = Math.min(z1, z2);
      int maxZ = Math.max(z1, z2);
      BlockState cornice = Blocks.STONE_BRICK_SLAB.defaultBlockState();
      BlockState corniceTop = (BlockState)Blocks.STONE_BRICK_SLAB.defaultBlockState().setValue(SlabBlock.TYPE, SlabType.TOP);
      BlockState pilaster = Blocks.POLISHED_ANDESITE.defaultBlockState();
      BlockState ceilingLight = Blocks.SEA_LANTERN.defaultBlockState();
      BlockState ceilingLightAlt = Blocks.OCHRE_FROGLIGHT.defaultBlockState();
      MutableBlockPos p = new MutableBlockPos();
      int W = maxX - minX + 1;
      int D = maxZ - minZ + 1;
      int[][] topY = new int[W][D];

      for (int ix = 0; ix < W; ix++) {
         for (int iz = 0; iz < D; iz++) {
            topY[ix][iz] = Integer.MIN_VALUE;
         }
      }

      for (int x = minX; x <= maxX; x++) {
         for (int z = minZ; z <= maxZ; z++) {
            for (int y = maxY; y >= minY; y--) {
               BlockState st = l.getBlockState(p.set(x, y, z));
               if (!st.isAir() && !isFoliage(st)) {
                  // Ground, roads and low garden walls are not part of the building's outline.
                  if (y >= minY + 3) {
                     topY[x - minX][z - minZ] = y;
                  }
                  break;
               }
            }
         }
      }

      for (int x = minX; x <= maxX; x++) {
         for (int z = minZ; z <= maxZ; z++) {
            int ty = topY[x - minX][z - minZ];
            if (ty != Integer.MIN_VALUE) {
               boolean isEdge = false;

               for (int[] d : new int[][]{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}) {
                  int nx = x - minX + d[0];
                  int nz = z - minZ + d[1];
                  int nt = nx >= 0 && nx < W && nz >= 0 && nz < D ? topY[nx][nz] : Integer.MIN_VALUE;
                  if (nt == Integer.MIN_VALUE || nt <= ty - 2) {
                     isEdge = true;
                     break;
                  }
               }

               if (isEdge) {
                  BlockState above = l.getBlockState(p.set(x, ty + 1, z));
                  if (above.isAir()) {
                     l.setBlock(p.set(x, ty + 1, z), cornice, 2);
                  }
               }
            }
         }
      }

      if (pilasters) {
         for (int x = minX; x <= maxX; x++) {
            for (int zx = minZ; zx <= maxZ; zx++) {
               int ty = topY[x - minX][zx - minZ];
               if (ty != Integer.MIN_VALUE && ty - minY >= 5) {
                  int outsideCount = 0;
                  boolean isCornerX = false;
                  boolean isCornerZ = false;

                  for (int[] dx : new int[][]{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}) {
                     int nx = x - minX + dx[0];
                     int nz = zx - minZ + dx[1];
                     int nt = nx >= 0 && nx < W && nz >= 0 && nz < D ? topY[nx][nz] : Integer.MIN_VALUE;
                     if (nt == Integer.MIN_VALUE) {
                        outsideCount++;
                        if (dx[0] != 0) {
                           isCornerX = true;
                        }

                        if (dx[1] != 0) {
                           isCornerZ = true;
                        }
                     }
                  }

                  if (outsideCount >= 2 && isCornerX && isCornerZ) {
                     int outDX = 0;
                     int outDZ = 0;

                     for (int[] dxx : new int[][]{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}) {
                        int nx = x - minX + dxx[0];
                        int nz = zx - minZ + dxx[1];
                        int nt = nx >= 0 && nx < W && nz >= 0 && nz < D ? topY[nx][nz] : Integer.MIN_VALUE;
                        if (nt == Integer.MIN_VALUE) {
                           outDX = dxx[0];
                           outDZ = dxx[1];
                           break;
                        }
                     }

                     int px = x + outDX;
                     int pz = zx + outDZ;

                     for (int py = minY + 2; py <= ty; py++) {
                        BlockState cur = l.getBlockState(p.set(px, py, pz));
                        if (cur.isAir()) {
                           l.setBlock(p.set(px, py, pz), pilaster, 2);
                        }
                     }

                     l.setBlock(p.set(px, ty + 1, pz), corniceTop, 2);
                  }
               }
            }
         }
      }

      for (int x = minX; x <= maxX; x++) {
         if ((x - minX) % 5 == 2) {
            for (int zxx = minZ; zxx <= maxZ; zxx++) {
               if ((zxx - minZ) % 5 == 2 && topY[x - minX][zxx - minZ] != Integer.MIN_VALUE) {
                  for (int yx = maxY; yx > minY + 1; yx--) {
                     BlockState above = l.getBlockState(p.set(x, yx, zxx));
                     BlockState here = l.getBlockState(p.set(x, yx - 1, zxx));
                     BlockState below = l.getBlockState(p.set(x, yx - 2, zxx));
                     if (!above.isAir() && !isLight(above) && here.isAir() && below.isAir()) {
                        BlockState lt = (x + zxx) % 2 == 0 ? ceilingLight : ceilingLightAlt;
                        l.setBlock(p.set(x, yx, zxx), lt, 2);
                        break;
                     }
                  }
               }
            }
         }
      }

      addRoofOrnament(l, minX, minZ, maxX, maxZ, topY, roof);
   }

   private static boolean isFoliage(BlockState s) {
      Block b = s.getBlock();
      return b == Blocks.OAK_LEAVES
         || b == Blocks.BIRCH_LEAVES
         || b == Blocks.SPRUCE_LEAVES
         || b == Blocks.JUNGLE_LEAVES
         || b == Blocks.ACACIA_LEAVES
         || b == Blocks.DARK_OAK_LEAVES
         || b == Blocks.CHERRY_LEAVES
         || b == Blocks.AZALEA_LEAVES
         || b == Blocks.FLOWERING_AZALEA_LEAVES
         || b == Blocks.MANGROVE_LEAVES;
   }

   private static boolean isLight(BlockState s) {
      Block b = s.getBlock();
      return b == Blocks.SEA_LANTERN
         || b == Blocks.GLOWSTONE
         || b == Blocks.OCHRE_FROGLIGHT
         || b == Blocks.VERDANT_FROGLIGHT
         || b == Blocks.PEARLESCENT_FROGLIGHT
         || b == Blocks.SHROOMLIGHT
         || b == Blocks.JACK_O_LANTERN
         || b == Blocks.REDSTONE_LAMP
         || b == Blocks.LANTERN
         || b == Blocks.SOUL_LANTERN;
   }

   private static void addRoofOrnament(BlockCanvas l, int minX, int minZ, int maxX, int maxZ, int[][] topY, BuildUtil.RoofStyle roof) {
      int W = maxX - minX + 1;
      int D = maxZ - minZ + 1;
      int maxTop = Integer.MIN_VALUE;
      int minTop = Integer.MAX_VALUE;

      for (int[] row : topY) {
         for (int t : row) {
            if (t != Integer.MIN_VALUE) {
               if (t > maxTop) {
                  maxTop = t;
               }

               if (t < minTop) {
                  minTop = t;
               }
            }
         }
      }

      if (maxTop != Integer.MIN_VALUE) {
         long sumX = 0L;
         long sumZ = 0L;
         long cnt = 0L;
         int flatXMin = Integer.MAX_VALUE;
         int flatXMax = Integer.MIN_VALUE;
         int flatZMin = Integer.MAX_VALUE;
         int flatZMax = Integer.MIN_VALUE;

         for (int x = minX; x <= maxX; x++) {
            for (int z = minZ; z <= maxZ; z++) {
               if (topY[x - minX][z - minZ] >= maxTop - 1) {
                  sumX += (long)x;
                  sumZ += (long)z;
                  cnt++;
                  if (x < flatXMin) {
                     flatXMin = x;
                  }

                  if (x > flatXMax) {
                     flatXMax = x;
                  }

                  if (z < flatZMin) {
                     flatZMin = z;
                  }

                  if (z > flatZMax) {
                     flatZMax = z;
                  }
               }
            }
         }

         if (cnt >= 9L) {
            int cx = (int)(sumX / cnt);
            int cz = (int)(sumZ / cnt);
            int flatW = flatXMax - flatXMin + 1;
            int flatD = flatZMax - flatZMin + 1;
            BuildUtil.RoofStyle eff = roof;
            if (roof == BuildUtil.RoofStyle.AUTO) {
               int area = flatW * flatD;
               if (area <= 36) {
                  eff = BuildUtil.RoofStyle.GABLE;
               } else if (area <= 120) {
                  eff = BuildUtil.RoofStyle.HIP;
               } else if (area <= 400) {
                  eff = BuildUtil.RoofStyle.PENTHOUSE;
               } else {
                  eff = BuildUtil.RoofStyle.SPIRE;
               }
            }

            if (eff != BuildUtil.RoofStyle.NONE && eff != BuildUtil.RoofStyle.FLAT) {
               int baseY = maxTop + 1;
               BlockState tile = Blocks.DEEPSLATE_TILES.defaultBlockState();
               BlockState tileSlab = Blocks.DEEPSLATE_TILE_SLAB.defaultBlockState();
               BlockState tileStairsBase = Blocks.DEEPSLATE_TILE_STAIRS.defaultBlockState();
               BlockState frame = Blocks.DARK_OAK_LOG.defaultBlockState();
               BlockState wall = Blocks.POLISHED_ANDESITE.defaultBlockState();
               BlockState window = Blocks.GLASS.defaultBlockState();
               BlockState light = Blocks.LANTERN.defaultBlockState();
               BlockState beacon = Blocks.REDSTONE_LAMP.defaultBlockState();
               MutableBlockPos p = new MutableBlockPos();
               switch (eff) {
                  case GABLE:
                     int hd = Math.min(7, flatD / 2 + (flatD % 2 == 1 ? 0 : 0));
                     int topY2 = 0;

                     for (int y = 0; y <= hd; y++) {
                        int z0x = flatZMin + y;
                        int z1x = flatZMax - y;
                        if (z0x > z1x) {
                           break;
                        }

                        topY2 = y;

                        for (int xx = flatXMin - 1; xx <= flatXMax + 1; xx++) {
                           if (xx >= minX && xx <= maxX) {
                              if (z0x >= minZ && z0x <= maxZ) {
                                 l.setBlock(p.set(xx, baseY + y, z0x), tile, 2);
                              }

                              if (z1x != z0x && z1x >= minZ && z1x <= maxZ) {
                                 l.setBlock(p.set(xx, baseY + y, z1x), tile, 2);
                              }
                           }
                        }

                        for (int zzx = z0x + 1; zzx <= z1x - 1; zzx++) {
                           if (zzx >= minZ && zzx <= maxZ) {
                              int xa = flatXMin - 1;
                              int xb = flatXMax + 1;
                              if (xa >= minX && xa <= maxX) {
                                 l.setBlock(p.set(xa, baseY + y, zzx), tile, 2);
                              }

                              if (xb >= minX && xb <= maxX) {
                                 l.setBlock(p.set(xb, baseY + y, zzx), tile, 2);
                              }
                           }
                        }
                     }

                     for (int xxx = flatXMin - 1; xxx <= flatXMax + 1; xxx++) {
                        if (xxx >= minX && xxx <= maxX) {
                           l.setBlock(p.set(xxx, baseY + topY2, cz), tile, 2);
                        }
                     }

                     l.setBlock(p.set(cx, baseY + topY2 + 1, cz), light, 2);
                     break;
                  case HIP:
                  case TILE_HIP:
                     int layers = Math.min(Math.min(flatW, flatD) / 2 + 1, 8);
                     int lastY = 0;

                     for (int y = 0; y < layers; y++) {
                        int x0 = flatXMin + y;
                        int x1 = flatXMax - y;
                        int z0 = flatZMin + y;
                        int z1 = flatZMax - y;
                        if (x0 > x1 || z0 > z1) {
                           break;
                        }

                        lastY = y;

                        for (int x = x0; x <= x1; x++) {
                           if (x >= minX && x <= maxX) {
                              if (z0 >= minZ && z0 <= maxZ) {
                                 l.setBlock(p.set(x, baseY + y, z0), tile, 2);
                              }

                              if (z1 >= minZ && z1 <= maxZ) {
                                 l.setBlock(p.set(x, baseY + y, z1), tile, 2);
                              }
                           }
                        }

                        for (int zxxx = z0; zxxx <= z1; zxxx++) {
                           if (zxxx >= minZ && zxxx <= maxZ) {
                              if (x0 >= minX && x0 <= maxX) {
                                 l.setBlock(p.set(x0, baseY + y, zxxx), tile, 2);
                              }

                              if (x1 >= minX && x1 <= maxX) {
                                 l.setBlock(p.set(x1, baseY + y, zxxx), tile, 2);
                              }
                           }
                        }

                        if (x1 - x0 <= 1 && z1 - z0 <= 1) {
                           for (int xx = x0; xx <= x1; xx++) {
                              for (int zz = z0; zz <= z1; zz++) {
                                 if (xx >= minX && xx <= maxX && zz >= minZ && zz <= maxZ) {
                                    l.setBlock(p.set(xx, baseY + y, zz), tile, 2);
                                 }
                              }
                           }
                           break;
                        }
                     }

                     l.setBlock(p.set(cx, baseY + lastY + 1, cz), light, 2);
                     break;
                  case PENTHOUSE:
                     int pw = Math.min(flatW - 4, 9);
                     int pd = Math.min(flatD - 4, 9);
                     if (pw < 3 || pd < 3) {
                        return;
                     }

                     int px1 = cx - pw / 2;
                     int px2 = px1 + pw - 1;
                     int pz1 = cz - pd / 2;
                     int pz2 = pz1 + pd - 1;
                     int phh = 4;

                     for (int y = 0; y <= phh; y++) {
                        for (int xxxx = px1; xxxx <= px2; xxxx++) {
                           for (int zxxxx = pz1; zxxxx <= pz2; zxxxx++) {
                              boolean edge = xxxx == px1 || xxxx == px2 || zxxxx == pz1 || zxxxx == pz2;
                              if (edge && y != phh) {
                                 BlockState s = wall;
                                 if (y >= 1 && y <= phh - 1 && (xxxx + zxxxx) % 2 == 0) {
                                    s = window;
                                 }

                                 l.setBlock(p.set(xxxx, baseY + y, zxxxx), s, 2);
                              }
                           }
                        }
                     }

                     for (int xxxx = px1 + 1; xxxx <= px2 - 1; xxxx++) {
                        for (int zxxxxx = pz1 + 1; zxxxxx <= pz2 - 1; zxxxxx++) {
                           l.setBlock(p.set(xxxx, baseY + phh, zxxxxx), tile, 2);
                        }
                     }

                     l.setBlock(p.set(cx, baseY + phh - 1, cz), Blocks.SEA_LANTERN.defaultBlockState(), 2);
                     int roofLayers = Math.min(pw, pd) / 2;

                     for (int y = 0; y <= roofLayers; y++) {
                        int x0x = px1 + y;
                        int x1x = px2 - y;
                        int z0x = pz1 + y;
                        int z1x = pz2 - y;

                        for (int xxxx = x0x; xxxx <= x1x; xxxx++) {
                           l.setBlock(p.set(xxxx, baseY + phh + y, z0x), tile, 2);
                           l.setBlock(p.set(xxxx, baseY + phh + y, z1x), tile, 2);
                        }

                        for (int zxxxxx = z0x; zxxxxx <= z1x; zxxxxx++) {
                           l.setBlock(p.set(x0x, baseY + phh + y, zxxxxx), tile, 2);
                           l.setBlock(p.set(x1x, baseY + phh + y, zxxxxx), tile, 2);
                        }
                     }

                     for (int y = 0; y < 6; y++) {
                        l.setBlock(p.set(cx, baseY + phh + roofLayers + 1 + y, cz), Blocks.IRON_BARS.defaultBlockState(), 2);
                     }

                     l.setBlock(p.set(cx, baseY + phh + roofLayers + 7, cz), beacon, 2);
                     break;
                  case SPIRE:
                     int baseSize = 5;
                     int x0 = cx - baseSize / 2;
                     int x1 = x0 + baseSize - 1;
                     int z0 = cz - baseSize / 2;
                     int z1 = z0 + baseSize - 1;

                     for (int y = 0; y < 4; y++) {
                        for (int x = x0; x <= x1; x++) {
                           for (int zx = z0; zx <= z1; zx++) {
                              boolean edge = x == x0 || x == x1 || zx == z0 || zx == z1;
                              if (edge) {
                                 l.setBlock(p.set(x, baseY + y, zx), wall, 2);
                              }
                           }
                        }
                     }

                     for (int y = 4; y < 14; y++) {
                        int shrink = (y - 4) / 3;
                        int xa = x0 + shrink;
                        int xb = x1 - shrink;
                        int za = z0 + shrink;
                        int zb = z1 - shrink;
                        if (xa > xb || za > zb) {
                           break;
                        }

                        for (int x = xa; x <= xb; x++) {
                           for (int zxx = za; zxx <= zb; zxx++) {
                              boolean edge = x == xa || x == xb || zxx == za || zxx == zb;
                              if (edge) {
                                 l.setBlock(p.set(x, baseY + y, zxx), frame, 2);
                              }
                           }
                        }
                     }

                     for (int y = 14; y < 20; y++) {
                        l.setBlock(p.set(cx, baseY + y, cz), Blocks.IRON_BARS.defaultBlockState(), 2);
                     }

                     l.setBlock(p.set(cx, baseY + 20, cz), beacon, 2);
               }
            }
         }
      }
   }

   public static enum RoofStyle {
      AUTO,
      FLAT,
      HIP,
      GABLE,
      PENTHOUSE,
      SPIRE,
      TILE_HIP,
      NONE;
   }
}
