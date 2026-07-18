import { describe, expect, it } from "vitest";
import { emptyData } from "./types";
import {
  allocateDriver,
  allocateDeliveryRoute,
  allocateVehicle,
  updateDeliveryRouteInData,
} from "./phase9a-fleet";
import {
  buildCourierRouteView,
  findCourierAccessForUser,
  getCourierRouteById,
  isDateAllowedForCourier,
  listCourierRoutesForDate,
  revokeCourierAccessInData,
  todayYmd,
  upsertCourierAccessInData,
} from "./courier-access";

function seedFleet() {
  let data = emptyData();
  const d = allocateDriver(data, {
    displayName: "COURIER-LIVE-TEST-Driver",
    phone: "0501111111",
    secondaryPhone: "",
    email: "",
    licenseNumber: "",
    licenseExpiryDate: "",
    isActive: true,
    notes: "",
  });
  if ("error" in d) throw new Error(d.error);
  data = d.data;
  const v = allocateVehicle(data, {
    licensePlate: "12-345-67",
    displayName: "COURIER-LIVE-TEST-Van",
    vehicleType: "van",
    maxWeightKg: 0,
    maxVolumeM3: 0,
    maxStops: 0,
    registrationExpiryDate: "",
    insuranceExpiryDate: "",
    isActive: true,
    notes: "",
  });
  if ("error" in v) throw new Error(v.error);
  data = v.data;
  const today = todayYmd();
  const route = allocateDeliveryRoute(data, {
    routeDate: today,
    routeName: "COURIER-LIVE-TEST-Route",
    deliveryAreaId: "center",
    deliveryAreaSnapshot: { name: "מרכז" },
    driverId: d.driver.id,
    driverSnapshot: { displayName: d.driver.displayName },
    vehicleId: v.vehicle.id,
    vehicleSnapshot: { displayName: v.vehicle.displayName, licensePlate: v.vehicle.licensePlate },
    plannedStartTime: "08:00",
    plannedEndTime: "18:00",
    planningStatus: "Planned",
    notes: "",
    stops: [
      {
        deliveryId: "del-1",
        cashCollectionAmount: 450,
        stopNotes: "קומה 3",
        customerSnapshot: { customerName: "לקוח א", phone: "0509999999" },
        addressSnapshot: { city: "חיפה", street: "הרצל", houseNumber: "10", deliveryNotes: "קוד 123" },
        deliverySnapshot: {
          itemsSnapshot: [{ name: "שולחן", quantity: 1, notes: "" }],
          deliveryNotes: "להשאיר בכניסה",
          paymentTypeSnapshot: "cashOnDelivery",
        },
      },
      {
        deliveryId: "del-2",
        cashCollectionAmount: 0,
        stopNotes: "",
        customerSnapshot: { customerName: "לקוח ב", phone: "0508888888" },
        addressSnapshot: { city: "חיפה", street: "יפו", houseNumber: "2" },
        deliverySnapshot: { itemsSnapshot: [{ name: "כיסא", quantity: 2 }], paymentTypeSnapshot: "cashOnDelivery" },
      },
    ],
  });
  if ("error" in route) throw new Error(route.error);
  data = route.data;
  return { data, driver: d.driver, route: route.route, today };
}

describe("Courier Daily View access", () => {
  it("CDV-001 upsert access and list ordered stops with cash totals", () => {
    const seeded = seedFleet();
    let data = seeded.data;
    const up = upsertCourierAccessInData(data, {
      userAccountId: "test-courier",
      driverId: seeded.driver.id,
      canViewPhone: true,
      canViewCashCollection: true,
      canOpenNavigation: true,
    });
    expect("error" in up).toBe(false);
    if ("error" in up) return;
    data = up.data;
    const listed = listCourierRoutesForDate(data, up.access, seeded.today);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.routes.length).toBe(1);
    const r = listed.routes[0];
    expect(r.stops.map((s) => s.sequence)).toEqual([1, 2]);
    expect(r.stops[0].customerName).toBe("לקוח א");
    expect(r.stops[0].cashCollectionAmount).toBe(450);
    expect(r.stops[1].cashCollectionAmount).toBe(0);
    expect(r.totalCashToCollect).toBe(450);
    expect(r.serverTotalVerified).toBe(true);
    expect(r.stopsWithCash).toBe(1);
  });

  it("CDV-002 other driver route blocked; draft hidden; revoked access", () => {
    const seeded = seedFleet();
    let data = seeded.data;
    const other = allocateDriver(data, {
      displayName: "Other",
      phone: "0500000000",
      secondaryPhone: "",
      email: "",
      licenseNumber: "",
      licenseExpiryDate: "",
      isActive: true,
      notes: "",
    });
    if ("error" in other) throw new Error(other.error);
    data = other.data;

    const up = upsertCourierAccessInData(data, {
      userAccountId: "test-courier",
      driverId: seeded.driver.id,
    });
    if ("error" in up) throw new Error(up.error);
    data = up.data;

    // Foreign route id must not be readable
    const foreign = getCourierRouteById(data, up.access, "nope");
    expect(foreign.ok).toBe(false);

    // Draft route hidden by default
    const asDraft = updateDeliveryRouteInData(data, seeded.route.id, { planningStatus: "Draft" });
    if ("error" in asDraft) throw new Error(asDraft.error);
    data = asDraft.data;
    const access = findCourierAccessForUser(data, "test-courier")!;
    const listed = listCourierRoutesForDate(data, access, seeded.today);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.routes.length).toBe(0);

    const rev = revokeCourierAccessInData(data, "test-courier");
    expect("error" in rev).toBe(false);
    if ("error" in rev) return;
    const after = listCourierRoutesForDate(rev.data, rev.access, seeded.today);
    expect(after.ok).toBe(false);
  });

  it("CDV-003 hidden phone/cash omitted from projection; date mode todayOnly", () => {
    const seeded = seedFleet();
    const up = upsertCourierAccessInData(seeded.data, {
      userAccountId: "test-courier",
      driverId: seeded.driver.id,
      canViewPhone: false,
      canViewCashCollection: false,
      canOpenNavigation: false,
      allowedDateMode: "todayOnly",
    });
    if ("error" in up) throw new Error(up.error);
    expect(isDateAllowedForCourier(up.access, seeded.today)).toBe(true);
    expect(isDateAllowedForCourier(up.access, "2099-01-01")).toBe(false);
    const view = buildCourierRouteView(up.data, seeded.route, up.access);
    expect(view.stops[0].phone).toBeNull();
    expect(view.stops[0].cashCollectionAmount).toBeNull();
    expect(view.stops[0].navigationQuery).toBe("");
    expect(view.totalCashToCollect).toBe(0);
  });
});
