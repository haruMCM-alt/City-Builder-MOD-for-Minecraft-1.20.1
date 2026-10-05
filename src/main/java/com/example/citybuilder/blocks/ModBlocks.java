package com.example.citybuilder.blocks;

import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

public final class ModBlocks {
   public static final DeferredRegister<Block> BLOCKS = DeferredRegister.create(ForgeRegistries.BLOCKS, "citybuilder");
   public static final DeferredRegister<Item> BLOCK_ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, "citybuilder");

   public static final RegistryObject<Block> ELEVATOR = BLOCKS.register("elevator", () -> new ElevatorBlock(
         BlockBehaviour.Properties.of().mapColor(MapColor.METAL).strength(3.0F, 6.0F).sound(SoundType.METAL).lightLevel(s -> 4)));
   public static final RegistryObject<Block> TRAFFIC_LIGHT = BLOCKS.register("traffic_light", () -> new TrafficLightBlock(
         BlockBehaviour.Properties.of().mapColor(MapColor.COLOR_GRAY).strength(2.0F, 6.0F).sound(SoundType.METAL).lightLevel(s -> 9).noOcclusion()));

   public static final RegistryObject<Item> ELEVATOR_ITEM = BLOCK_ITEMS.register("elevator", () -> new BlockItem(ELEVATOR.get(), new Item.Properties()));
   public static final RegistryObject<Item> TRAFFIC_LIGHT_ITEM = BLOCK_ITEMS.register("traffic_light", () -> new BlockItem(TRAFFIC_LIGHT.get(), new Item.Properties()));

   private ModBlocks() {
   }
}
