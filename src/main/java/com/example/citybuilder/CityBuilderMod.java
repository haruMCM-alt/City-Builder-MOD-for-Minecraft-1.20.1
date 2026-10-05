package com.example.citybuilder;

import com.example.citybuilder.blocks.ElevatorHandler;
import com.example.citybuilder.blocks.ModBlocks;
import com.example.citybuilder.commands.ModCommands;
import com.example.citybuilder.config.CityBuilderConfig;
import com.example.citybuilder.engine.BuildManager;
import com.example.citybuilder.items.ModItems;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.RegisterCommandsEvent;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.event.server.ServerStoppingEvent;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.ModLoadingContext;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.config.ModConfig;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.RegistryObject;

@Mod(CityBuilderMod.MODID)
public class CityBuilderMod {
   public static final String MODID = "citybuilder";
   public static final DeferredRegister<CreativeModeTab> TABS = DeferredRegister.create(Registries.CREATIVE_MODE_TAB, MODID);
   public static final RegistryObject<CreativeModeTab> MAIN_TAB = TABS.register("main", () -> CreativeModeTab.builder()
         .title(Component.translatable("itemGroup.citybuilder.main"))
         .icon(() -> new ItemStack(ModItems.CAR.get()))
         .displayItems((params, output) -> {
            output.accept(ModItems.CAR.get());
            output.accept(ModItems.TAXI.get());
            output.accept(ModItems.TRUCK.get());
            output.accept(ModItems.BUS.get());
            output.accept(ModItems.SPORTS_CAR.get());
            output.accept(ModItems.SMARTPHONE.get());
            output.accept(ModItems.LASER.get());
            output.accept(ModBlocks.ELEVATOR_ITEM.get());
            output.accept(ModBlocks.TRAFFIC_LIGHT_ITEM.get());
         })
         .build());

   public CityBuilderMod() {
      IEventBus modBus = FMLJavaModLoadingContext.get().getModEventBus();
      ModBlocks.BLOCKS.register(modBus);
      ModBlocks.BLOCK_ITEMS.register(modBus);
      ModItems.ITEMS.register(modBus);
      TABS.register(modBus);
      ModLoadingContext.get().registerConfig(ModConfig.Type.SERVER, CityBuilderConfig.SPEC);
      MinecraftForge.EVENT_BUS.register(this);
   }

   @SubscribeEvent
   public void onRegisterCommands(RegisterCommandsEvent event) {
      ModCommands.register(event.getDispatcher());
   }

   @SubscribeEvent
   public void onServerTick(TickEvent.ServerTickEvent event) {
      if (event.phase == TickEvent.Phase.END) {
         BuildManager.tick(event.getServer());
      }
   }

   @SubscribeEvent
   public void onPlayerTick(TickEvent.PlayerTickEvent event) {
      if (event.phase == TickEvent.Phase.END && event.player instanceof ServerPlayer sp) {
         ElevatorHandler.tick(sp);
      }
   }

   @SubscribeEvent
   public void onLogout(PlayerEvent.PlayerLoggedOutEvent event) {
      ElevatorHandler.forget(event.getEntity().getUUID());
   }

   @SubscribeEvent
   public void onServerStopping(ServerStoppingEvent event) {
      BuildManager.clear();
   }
}
