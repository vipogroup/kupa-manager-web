/** Phase 9A entity shapes — no AppData dependency (avoids circular imports). */

export type Driver = {
  id: string;
  driverNumber?: string;
  displayName: string;
  phone: string;
  secondaryPhone: string;
  email: string;
  licenseNumber: string;
  licenseExpiryDate: string;
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

export type Vehicle = {
  id: string;
  vehicleNumber?: string;
  licensePlate: string;
  displayName: string;
  vehicleType: string;
  maxWeightKg: number;
  maxVolumeM3: number;
  maxStops: number;
  registrationExpiryDate: string;
  insuranceExpiryDate: string;
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

export type RouteStop = {
  id: string;
  sequence: number;
  deliveryId: string;
  deliverySnapshot: Record<string, unknown>;
  customerSnapshot: Record<string, unknown>;
  addressSnapshot: Record<string, unknown>;
  deliveryAreaSnapshot: Record<string, unknown>;
  cashCollectionAmount: number;
  estimatedServiceMinutes: number;
  stopNotes: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

export type DeliveryRoute = {
  id: string;
  routeNumber?: string;
  routeDate: string;
  routeName: string;
  deliveryAreaId: string;
  deliveryAreaSnapshot: Record<string, unknown>;
  driverId: string;
  driverSnapshot: Record<string, unknown>;
  vehicleId: string;
  vehicleSnapshot: Record<string, unknown>;
  plannedStartTime: string;
  plannedEndTime: string;
  planningStatus: string;
  stops: RouteStop[];
  capacitySummary: Record<string, unknown>;
  warningSummary: string[] | Record<string, unknown>;
  notes: string;
  isCancelled: boolean;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};
