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
  createdAt: string;
  updatedAt: string;
};

export type AppData = {
  version: 1;
  incomes: MoneyRecord[];
  expenses: MoneyRecord[];
  customers: Customer[];
  products: Product[];
  updatedAt: string;
  customerCounter?: number;
  productCounter?: number;
};

export type TabId = "home" | "income" | "expense" | "customers" | "products" | "sync";

export function emptyData(): AppData {
  return {
    version: 1,
    incomes: [],
    expenses: [],
    customers: [],
    products: [],
    updatedAt: new Date().toISOString(),
    customerCounter: 0,
    productCounter: 0,
  };
}
