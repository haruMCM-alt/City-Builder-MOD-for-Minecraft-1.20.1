package com.example.citybuilder.client;

import net.minecraft.client.Minecraft;

/** Client-only entry points, kept in their own class so the dedicated server never loads them. */
public final class ClientHooks {
   private ClientHooks() {
   }

   public static void openPhone() {
      Minecraft.getInstance().setScreen(new PhoneScreen());
   }
}
