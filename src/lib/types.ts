import { CLOUD_CONTRACT_VERSION } from "./cloud-contract";
import type { DeliveryRoute, Driver, Vehicle } from "./phase9a-types";

export type { DeliveryRoute, Driver, Vehicle, RouteStop } from "./phase9a-types";

export type MoneyRecord = {
  id: string;
  title: string;
  amount: number;
  date: string;
  category: string;
  note: string;
  customerId?: string;
};

export type CustomerType = "private" | "business";
export type DeliveryArea = "unassigned" | "center" | "north" | "south";

export type Customer = {
  id: string;
  customerNumber: string;
  customerType: CustomerType;
  name: string;
  businessName: string;
  phone: string;
  secondaryPhone: string;
  email: string;
  street: string;
  houseNumber: string;
  entrance: string;
  floor: string;
  apartment: string;
  city: string;
  zipCode: string;
  deliveryArea: DeliveryArea;
  deliveryNotes: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  productNumber: string;
  name: string;
  model: string;
  sku: string;
  barcode: string;
  description: string;
  salePrice: number;
  costPrice: number;
  stockQuantity: number;
  unit: string;
  active: boolean;
  /** When true, product may appear on the public customer order form. */
  visibleOnCustomerOrderForm?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OrderStatus = "draft" | "confirmed" | "cancelled";
export type PaymentType = "cashOnDelivery";

export type CustomerSnapshot = {
  customerNumber: string;
  customerName: string;
  businessName: string;
  phone: string;
  secondaryPhone: string;
  email: string;
  street: string;
  houseNumber: string;
  entrance: string;
  floor: string;
  apartment: string;
  city: string;
  zipCode: string;
  deliveryArea: DeliveryArea;
  deliveryNotes: string;
};

export type DeliveryAddressSnapshot = {
  street: string;
  houseNumber: string;
  entrance: string;
  floor: string;
  apartment: string;
  city: string;
  zipCode: string;
  deliveryNotes: string;
};

export type ProductSnapshot = {
  productNumber: string;
  name: string;
  model: string;
  sku: string;
  barcode: string;
  unit: string;
};

export type OrderItem = {
  id: string;
  productId: string;
  productSnapshot: ProductSnapshot;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string;
};

export type Order = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customerId: string;
  customerSnapshot: CustomerSnapshot;
  items: OrderItem[];
  /** Sum of product line totals only (excludes shipping). */
  itemsSubtotal: number;
  /** Order shipping fee (≥ 0). Not an inventory product line. */
  shippingFee: number;
  /** itemsSubtotal + shippingFee — always recomputed server/local, never trusted from client alone. */
  totalAmount: number;
  paymentType: PaymentType;
  deliveryAreaSnapshot: DeliveryArea;
  deliveryAddressSnapshot: DeliveryAddressSnapshot;
  orderNotes: string;
  cancellationReason: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string;
  cancelledAt: string;
};

export type InventoryMovementType = "opening" | "increase" | "decrease" | "correction";

export type InventoryMovement = {
  id: string;
  movementNumber: string;
  productId: string;
  productSnapshot: ProductSnapshot;
  movementType: InventoryMovementType;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  notes: string;
  createdAt: string;
};

export type WorkspaceCounters = {
  nextOrderNumber: number;
  nextInventoryMovementNumber: number;
  nextDeliveryNumber: number;
  nextDriverNumber?: number;
  nextVehicleNumber?: number;
  nextDeliveryRouteNumber?: number;
  nextRouteStopNumber?: number;
  nextCustomerOrderRequestNumber?: number;
};

export type DeliveryStatus = "pending" | "ready" | "cancelled";

export type DeliveryItemSnapshot = {
  productNumber: string;
  name: string;
  model: string;
  sku: string;
  barcode: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type Delivery = {
  id: string;
  deliveryNumber: string;
  orderId: string;
  orderNumberSnapshot: string;
  status: DeliveryStatus;
  scheduledDate: string;
  deliveryAreaSnapshot: DeliveryArea;
  customerSnapshot: CustomerSnapshot;
  addressSnapshot: DeliveryAddressSnapshot;
  itemsSnapshot: DeliveryItemSnapshot[];
  itemsSubtotalSnapshot: number;
  shippingFeeSnapshot: number;
  orderTotalSnapshot: number;
  paymentTypeSnapshot: PaymentType;
  deliveryNotes: string;
  cancellationReason: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string;
};

export type AppData = {
  version: 1;
  /** Cloud contract — not Windows DesktopSchemaVersion (15). */
  cloudContractVersion?: number;
  /** Optional echo of Windows schema for adapters; never confused with cloudContractVersion. */
  desktopSchemaVersion?: number;
  incomes: MoneyRecord[];
  expenses: MoneyRecord[];
  customers: Customer[];
  products: Product[];
  orders: Order[];
  inventoryMovements: InventoryMovement[];
  deliveries: Delivery[];
  drivers?: Driver[];
  vehicles?: Vehicle[];
  deliveryRoutes?: DeliveryRoute[];
  /** Public form inbox — cloud-shared; not a paid order until Approved. */
  customerOrderRequests?: Array<{ id: string; [key: string]: unknown }>;
  updatedAt: string;
  customerCounter?: number;
  productCounter?: number;
  counters?: WorkspaceCounters;
};

export type TabId =
  | "home"
  | "income"
  | "expense"
  | "customers"
  | "products"
  | "orders"
  | "inventory"
  | "deliveries"
  | "drivers"
  | "vehicles"
  | "routes"
  | "orderRequests"
  | "sync";

export function emptyData(): AppData {
  return {
    version: 1,
    cloudContractVersion: CLOUD_CONTRACT_VERSION,
    incomes: [],
    expenses: [],
    customers: [],
    products: [],
    orders: [],
    inventoryMovements: [],
    deliveries: [],
    drivers: [],
    vehicles: [],
    deliveryRoutes: [],
    customerOrderRequests: [],
    updatedAt: new Date().toISOString(),
    customerCounter: 0,
    productCounter: 0,
    counters: {
      nextOrderNumber: 0,
      nextInventoryMovementNumber: 0,
      nextDeliveryNumber: 0,
      nextDriverNumber: 0,
      nextVehicleNumber: 0,
      nextDeliveryRouteNumber: 0,
      nextRouteStopNumber: 0,
      nextCustomerOrderRequestNumber: 0,
    },
  };
}
