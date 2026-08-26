import { shouldUseRemote } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase/client";
import { signOut } from "@/src/features/auth/service";
import { resetMockBilling } from "@/src/lib/revenuecat/mock-sdk";
import { resetMockChildren } from "@/src/features/children/service";

export async function deleteOwnAccount() {
  if (!shouldUseRemote()) {
    await resetMockBilling();
    await resetMockChildren();
    await signOut();
    return { mocked: true };
  }
  const { error } = await supabase.functions.invoke("delete-account", { body: {} });
  if (error) throw error;
  await signOut();
  return { mocked: false };
}
