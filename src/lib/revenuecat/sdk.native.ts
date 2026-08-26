import { canUseNativePurchases } from "@/src/lib/env";
import { mockBillingSdk } from "@/src/lib/revenuecat/mock-sdk";
import { nativeBillingSdk } from "@/src/lib/revenuecat/native-sdk";

export const billingSdk = canUseNativePurchases() ? nativeBillingSdk : mockBillingSdk;
