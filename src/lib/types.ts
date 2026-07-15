export type MoneyRecord = {
  id: string;
  title: string;
  amount: number;
  date: string;
  category: string;
  note: string;
  customerId?: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  note: string;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  sku: string;
  stock: number;
};

export type AppData = {
  version: 1;
  incomes: MoneyRecord[];
  expenses: MoneyRecord[];
  customers: Customer[];
  products: Product[];
  updatedAt: string;
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
  };
}
