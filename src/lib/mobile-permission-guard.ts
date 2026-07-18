import type { DesktopMutateAction } from "./desktop-mutate";
import type { MobileModuleId, MobileModulePermission, MobileUiPreferences } from "./ui-prefs/types";
import { readAccountPreferences } from "./ui-prefs/prefs-cloud";

const ACTION_MODULE: Partial<Record<DesktopMutateAction, MobileModuleId>> = {
  createDriver: "drivers",
  updateDriver: "drivers",
  deactivateDriver: "drivers",
  reactivateDriver: "drivers",
  createVehicle: "vehicles",
  updateVehicle: "vehicles",
  deactivateVehicle: "vehicles",
  reactivateVehicle: "vehicles",
  createDeliveryRoute: "routes",
  updateDeliveryRoute: "routes",
  cancelDeliveryRoute: "routes",
  reorderRouteStops: "routes",
  createCustomer: "customers",
  updateCustomer: "customers",
  deactivateCustomer: "customers",
  reactivateCustomer: "customers",
  createProduct: "products",
  updateProduct: "products",
  deactivateProduct: "products",
  reactivateProduct: "products",
  createOrder: "orders",
  updateOrder: "orders",
  confirmOrder: "orders",
  cancelOrder: "orders",
  copyOrder: "orders",
  createOrderPayment: "orders",
  voidOrderPayment: "orders",
  createDelivery: "deliveries",
  updateDelivery: "deliveries",
  markDeliveryReady: "deliveries",
  returnDeliveryToPending: "deliveries",
  cancelDelivery: "deliveries",
  increaseInventory: "inventory",
  decreaseInventory: "inventory",
  correctInventory: "inventory",
};

function defaultPerm(): MobileModulePermission {
  return {
    visible: true,
    readOnly: false,
    createAllowed: true,
    editAllowed: true,
    disableAllowed: true,
    deleteAllowed: true,
    secondaryActionsAllowed: true,
  };
}

export function actionNeedsPermission(
  action: DesktopMutateAction,
  perm: MobileModulePermission
): { ok: true } | { ok: false; code: string; message: string } {
  if (!perm.visible || perm.readOnly) {
    return { ok: false, code: "MOBILE_MODULE_READONLY", message: "המודול במצב קריאה בלבד" };
  }
  if (action.startsWith("create") && !perm.createAllowed) {
    return { ok: false, code: "MOBILE_CREATE_DENIED", message: "יצירה אינה מורשית" };
  }
  if (
    (action.startsWith("update") ||
      action.includes("confirm") ||
      action.includes("copy") ||
      action.includes("reorder") ||
      action.includes("mark") ||
      action.includes("return")) &&
    !perm.editAllowed
  ) {
    return { ok: false, code: "MOBILE_EDIT_DENIED", message: "עריכה אינה מורשית" };
  }
  if (
    (action.startsWith("deactivate") || action.startsWith("reactivate") || action.includes("cancel")) &&
    !perm.disableAllowed
  ) {
    return { ok: false, code: "MOBILE_DISABLE_DENIED", message: "השבתה/ביטול אינם מורשים" };
  }
  if (action.startsWith("delete") && !perm.deleteAllowed) {
    return { ok: false, code: "MOBILE_DELETE_DENIED", message: "מחיקה אינה מורשית" };
  }
  return { ok: true };
}

/**
 * Enforce mobileControl permissions when modulePermissions are present in cloud prefs.
 * If preferences missing or modulePermissions absent → allow (backward compatible).
 */
export async function assertMobileMutationAllowed(
  accountId: string,
  action: DesktopMutateAction
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const moduleId = ACTION_MODULE[action];
  if (!moduleId) return { ok: true };

  let prefs: MobileUiPreferences | null = null;
  try {
    const read = await readAccountPreferences(accountId);
    if (read.exists) prefs = read.envelope.preferences;
  } catch {
    return { ok: true };
  }
  if (!prefs?.modulePermissions) return { ok: true };
  const perm = { ...defaultPerm(), ...(prefs.modulePermissions[moduleId] || {}) };
  if (prefs.preset === "readOnly") {
    return { ok: false, code: "MOBILE_PRESET_READONLY", message: "מצב קריאה בלבד" };
  }
  return actionNeedsPermission(action, perm);
}
