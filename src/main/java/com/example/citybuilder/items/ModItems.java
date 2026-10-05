package com.example.citybuilder.items;

import net.minecraft.world.item.Item;
import net.minecraft.world.item.Item.Properties;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

public final class ModItems {
   public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, "citybuilder");
   public static final RegistryObject<Item> CAR = ITEMS.register("car", () -> new CarItem(CarItem.Kind.SEDAN, new Properties().stacksTo(16)));
   public static final RegistryObject<Item> TAXI = ITEMS.register("taxi", () -> new CarItem(CarItem.Kind.TAXI, new Properties().stacksTo(16)));
   public static final RegistryObject<Item> TRUCK = ITEMS.register("truck", () -> new CarItem(CarItem.Kind.TRUCK, new Properties().stacksTo(16)));
   public static final RegistryObject<Item> BUS = ITEMS.register("bus", () -> new CarItem(CarItem.Kind.BUS, new Properties().stacksTo(16)));
   public static final RegistryObject<Item> SPORTS_CAR = ITEMS.register("sports_car", () -> new CarItem(CarItem.Kind.SPORTS, new Properties().stacksTo(16)));
   public static final RegistryObject<Item> SMARTPHONE = ITEMS.register("smartphone", () -> new SmartphoneItem(new Properties()));
   public static final RegistryObject<Item> LASER = ITEMS.register("laser", () -> new LaserItem(new Properties()));

   private ModItems() {
   }
}
