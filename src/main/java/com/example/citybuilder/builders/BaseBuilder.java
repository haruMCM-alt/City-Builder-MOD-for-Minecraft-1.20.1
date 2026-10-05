package com.example.citybuilder.builders;

import com.example.citybuilder.engine.BlockCanvas;
import net.minecraft.world.level.block.Blocks;

/**
 * Entry point for the {@code /base} buildings. Each design lives in {@link JapaneseBuildings},
 * {@link TownBuildings} or {@link Landmarks}; this class picks one and anchors it to the ground.
 */
public final class BaseBuilder {
   private BaseBuilder() {
   }

   public static void build(BlockCanvas level, BaseBuilder.Type type, int x, int y, int z, int size) {
      if (size < 3) {
         size = 3;
      }

      switch (type) {
         case HOUSE -> JapaneseBuildings.house(level, x, y, z, size);
         case FARM -> TownBuildings.farm(level, x, y, z, size);
         case WAREHOUSE -> TownBuildings.warehouse(level, x, y, z, size);
         case TOWER -> JapaneseBuildings.tower(level, x, y, z, size);
         case SHRINE -> JapaneseBuildings.shrine(level, x, y, z, size);
         case CAFE -> TownBuildings.cafe(level, x, y, z, size);
         case MANSION -> TownBuildings.mansion(level, x, y, z, size);
         case DOJO -> JapaneseBuildings.dojo(level, x, y, z, size);
         case KONBINI -> TownBuildings.konbini(level, x, y, z, size);
         case HOTSPRING -> JapaneseBuildings.hotspring(level, x, y, z, size);
         case TEMPLE -> JapaneseBuildings.temple(level, x, y, z, size);
         case ZAKKYO -> TownBuildings.zakkyo(level, x, y, z, size);
         case SENTO -> JapaneseBuildings.sento(level, x, y, z, size);
         case SHIBUYA109 -> Landmarks.shibuya109(level, x, y, z, size);
         case DEPARTMENT -> Landmarks.department(level, x, y, z, size);
         case PARK -> Landmarks.park(level, x, y, z, size);
         case KOBAN -> TownBuildings.koban(level, x, y, z, size);
         case SCHOOL -> Landmarks.school(level, x, y, z, size);
      }

      // Plinth down to the ground so nothing floats on a slope.
      int reach = Math.max(size, 48) + 4;
      for (int xx = x - 4; xx <= x + reach; xx++) {
         for (int zz = z - 4; zz <= z + reach; zz++) {
            if (level.isSet(xx, y + 1, zz) && !level.get(xx, y + 1, zz).isAir() && level.get(xx, y, zz).canBeReplaced()) {
               level.set(xx, y, zz, Blocks.STONE_BRICKS.defaultBlockState());
            }
            if (level.isSet(xx, y, zz) && !level.get(xx, y, zz).isAir()) {
               BuildUtil.foundation(level, xx, y - 1, zz, Blocks.STONE_BRICKS.defaultBlockState());
            }
         }
      }
   }

   public static enum Type {
      HOUSE,
      FARM,
      WAREHOUSE,
      TOWER,
      SHRINE,
      CAFE,
      MANSION,
      DOJO,
      KONBINI,
      HOTSPRING,
      TEMPLE,
      ZAKKYO,
      SENTO,
      SHIBUYA109,
      DEPARTMENT,
      PARK,
      KOBAN,
      SCHOOL;
   }
}
