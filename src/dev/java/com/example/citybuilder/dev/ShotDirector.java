package com.example.citybuilder.dev;

import com.example.citybuilder.engine.BuildManager;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Deque;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.server.IntegratedServer;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

/**
 * Development-only screenshot robot (not shipped in the mod jar). When the JVM is started with
 * {@code -Dcitybuilder.shots=<script>}, it runs the script line by line once a world is open:
 *
 * <pre>
 * cmd &lt;command&gt;            run a server command with full permissions
 * wait &lt;ticks&gt;             idle
 * waitbuild                 wait until every CityBuilder job has finished
 * cam x y z yaw pitch       move the camera there and wait for the chunks to render
 * shot &lt;name&gt;              save screenshots/&lt;name&gt;.png
 * quit                      close the game
 * </pre>
 */
@Mod.EventBusSubscriber(modid = "citybuilder", value = Dist.CLIENT)
public final class ShotDirector {
   private static Deque<String> lines;
   private static int waitTicks;
   private static boolean waitingBuild;
   private static boolean waitingRender;
   private static int renderTicks;
   private static int stableTicks;

   private ShotDirector() {
   }

   @SubscribeEvent
   public static void onTick(TickEvent.ClientTickEvent event) {
      if (event.phase != TickEvent.Phase.END) {
         return;
      }
      Minecraft mc = Minecraft.getInstance();
      String script = System.getProperty("citybuilder.shots");
      if (script == null || script.isEmpty() || mc.player == null || mc.level == null || mc.getSingleplayerServer() == null) {
         return;
      }
      if (lines == null) {
         try {
            lines = new ArrayDeque<>(Files.readAllLines(Path.of(script)));
         } catch (IOException e) {
            throw new RuntimeException(e);
         }
         mc.options.hideGui = true;
         waitTicks = 60;
         log("script loaded: " + lines.size() + " lines");
      }
      if (waitTicks > 0) {
         waitTicks--;
         return;
      }
      if (waitingBuild) {
         if (!BuildManager.isIdle()) {
            return;
         }
         waitingBuild = false;
         waitTicks = 20;
         return;
      }
      if (waitingRender) {
         renderTicks++;
         stableTicks = mc.levelRenderer.hasRenderedAllChunks() ? stableTicks + 1 : 0;
         if ((renderTicks < 60 || stableTicks < 40) && renderTicks < 1200) {
            return;
         }
         waitingRender = false;
      }
      while (!lines.isEmpty()) {
         String line = lines.poll().trim();
         if (line.isEmpty() || line.startsWith("#")) {
            continue;
         }
         log("> " + line);
         String[] p = line.split("\\s+", 2);
         IntegratedServer server = mc.getSingleplayerServer();
         switch (p[0]) {
            case "cmd" -> server.execute(() -> server.getCommands().performPrefixedCommand(server.createCommandSourceStack(), p[1]));
            case "wait" -> {
               waitTicks = Integer.parseInt(p[1]);
               return;
            }
            case "waitbuild" -> {
               waitingBuild = true;
               waitTicks = 10;
               return;
            }
            case "cam" -> {
               String name = mc.player.getGameProfile().getName();
               server.execute(() -> {
                  server.getCommands().performPrefixedCommand(server.createCommandSourceStack(), "gamemode spectator " + name);
                  server.getCommands().performPrefixedCommand(server.createCommandSourceStack(), "tp " + name + " " + p[1]);
               });
               waitingRender = true;
               renderTicks = 0;
               stableTicks = 0;
               return;
            }
            case "shot" -> {
               Screenshot.grab(mc.gameDirectory, p[1] + ".png", mc.getMainRenderTarget(), msg -> log(msg.getString()));
               waitTicks = 2;
               return;
            }
            case "quit" -> {
               mc.stop();
               return;
            }
            default -> log("unknown: " + line);
         }
      }
   }

   private static void log(String s) {
      System.out.println("[ShotDirector] " + s);
   }
}
