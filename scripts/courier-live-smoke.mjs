/**
 * COURIER-LIVE-TEST production smoke (test workspace only).
 * Reads credentials from TEMP files; never prints secrets.
 */
import fs from "fs";
import crypto from "crypto";

const BASE = process.env.KUPA_SMOKE_BASE || "https://kupa-manager-web.vercel.app";
const DEVICE = "cdv-live-smoke";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return {};
  const out = {};
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const adminCred = loadEnvFile(`${process.env.TEMP}\\kupa-phase9a2-test-cred.txt`);
const courierCred = loadEnvFile(`${process.env.TEMP}\\kupa-courier-test-cred.txt`);
const adminUser = adminCred.KUPA_TEST_ADMIN_USERNAME;
const adminPass = adminCred.KUPA_TEST_ADMIN_PASSWORD;
const courierUser = courierCred.KUPA_TEST_COURIER_USERNAME;
const courierPass = courierCred.KUPA_TEST_COURIER_PASSWORD;

if (!adminUser || !adminPass || !courierUser || !courierPass) {
  console.error("MISSING_CREDS");
  process.exit(2);
}

const results = [];
function log(id, status, detail = "") {
  results.push({ id, status, detail });
  console.log(`[${status}] ${id} ${detail}`);
}

async function desktopLogin(username, password) {
  const res = await fetch(`${BASE}/api/desktop/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.token) throw new Error(`login failed ${res.status}`);
  return json;
}

async function snapshot(token) {
  const res = await fetch(`${BASE}/api/desktop/snapshot`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`snapshot ${res.status}`);
  return json;
}

async function mutate(token, actionType, payload, expectedRevision, expectedETag) {
  const res = await fetch(`${BASE}/api/desktop/mutate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      actionType,
      payload,
      expectedRevision,
      expectedETag,
      idempotencyKey: `cdv-${actionType}-${crypto.randomBytes(8).toString("hex")}`,
      deviceId: DEVICE,
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function applyMutateMeta(m, state) {
  if (m.res.ok && (m.json?.ok || m.json?.success)) {
    state.rev = m.json.newRevision ?? state.rev;
    state.etag = m.json.newETag || state.etag;
    return m.json.updatedRecord || null;
  }
  return null;
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function main() {
  const tag = `COURIER-LIVE-TEST-${Date.now().toString(36)}`;
  let adminToken;
  let courierToken;
  const state = { rev: 0, etag: "" };
  let driverId = "";
  let vehicleId = "";
  let routeId = "";
  let stopIds = [];

  try {
    const adminLogin = await desktopLogin(adminUser, adminPass);
    adminToken = adminLogin.token;
    if (!adminLogin.isTestWorkspace) {
      log("CDV-LIVE-001", "FAIL", "not test workspace");
      process.exit(1);
    }
    log("CDV-LIVE-001", "PASS", "admin test workspace");

    let snap = await snapshot(adminToken);
    state.rev = snap.revision ?? 0;
    state.etag = snap.etag || "";
    const data = snap.data || {};

    // Cancel leftover live-test routes for today
    const today = todayYmd();
    for (const r of data.deliveryRoutes || []) {
      if (
        String(r.routeName || "").startsWith("COURIER-LIVE-TEST-") &&
        r.routeDate === today &&
        r.planningStatus !== "Cancelled"
      ) {
        const m = await mutate(adminToken, "cancelDeliveryRoute", { id: r.id, reason: "cleanup" }, state.rev, state.etag);
        applyMutateMeta(m, state);
      }
    }

    {
      const m = await mutate(
        adminToken,
        "createDriver",
        {
          displayName: `${tag}-Driver`,
          phone: "0501111111",
          secondaryPhone: "",
          email: "",
          licenseNumber: "",
          licenseExpiryDate: "",
          isActive: true,
          notes: tag,
        },
        state.rev,
        state.etag
      );
      const rec = applyMutateMeta(m, state);
      if (!m.res.ok || !rec?.id) throw new Error(`createDriver ${m.res.status} ${JSON.stringify(m.json)}`);
      driverId = rec.id;
      log("CDV-LIVE-002", "PASS", `driver=${driverId}`);
    }

    {
      const m = await mutate(
        adminToken,
        "createVehicle",
        {
          licensePlate: `CDV-${Math.floor(Math.random() * 900 + 100)}-${Date.now().toString(36).slice(-3)}`,
          displayName: `${tag}-Van`,
          vehicleType: "van",
          maxWeightKg: 0,
          maxVolumeM3: 0,
          maxStops: 0,
          registrationExpiryDate: "",
          insuranceExpiryDate: "",
          isActive: true,
          notes: tag,
        },
        state.rev,
        state.etag
      );
      const rec = applyMutateMeta(m, state);
      if (!m.res.ok || !rec?.id) throw new Error(`createVehicle ${m.res.status} ${JSON.stringify(m.json)}`);
      vehicleId = rec.id;
      log("CDV-LIVE-003", "PASS", `vehicle=${vehicleId}`);
    }

    {
      const m = await mutate(
        adminToken,
        "createDeliveryRoute",
        {
          routeDate: today,
          routeName: `${tag}-Route`,
          deliveryAreaId: "center",
          deliveryAreaSnapshot: { name: "מרכז" },
          driverId,
          driverSnapshot: { displayName: `${tag}-Driver` },
          vehicleId,
          vehicleSnapshot: { displayName: `${tag}-Van`, licensePlate: "00-000-00" },
          plannedStartTime: "08:00",
          plannedEndTime: "18:00",
          planningStatus: "Planned",
          notes: tag,
          stops: [
            {
              deliveryId: `${tag}-del-1`,
              cashCollectionAmount: 450,
              stopNotes: "קומה 3",
              customerSnapshot: { customerName: "לקוח א", phone: "0509999999" },
              addressSnapshot: {
                city: "חיפה",
                street: "הרצל",
                houseNumber: "10",
                entrance: "ב",
                floor: "3",
                apartment: "12",
                deliveryNotes: "קוד 123",
              },
              deliverySnapshot: {
                itemsSnapshot: [{ name: "שולחן", quantity: 1, notes: "" }],
                deliveryNotes: "להשאיר בכניסה",
                paymentTypeSnapshot: "cashOnDelivery",
              },
            },
            {
              deliveryId: `${tag}-del-2`,
              cashCollectionAmount: 0,
              stopNotes: "",
              customerSnapshot: { customerName: "לקוח ב", phone: "0508888888" },
              addressSnapshot: { city: "חיפה", street: "יפו", houseNumber: "2" },
              deliverySnapshot: {
                itemsSnapshot: [{ name: "כיסא", quantity: 2, notes: "שחור" }],
                deliveryNotes: "",
                paymentTypeSnapshot: "paid",
              },
            },
          ],
        },
        state.rev,
        state.etag
      );
      const rec = applyMutateMeta(m, state);
      if (!m.res.ok || !rec?.id) throw new Error(`createDeliveryRoute ${m.res.status} ${JSON.stringify(m.json)}`);
      routeId = rec.id;
      stopIds = (rec.stops || []).map((s) => s.id);
      log("CDV-LIVE-004", "PASS", `route=${routeId} stops=${stopIds.length}`);
    }

    {
      const m = await mutate(
        adminToken,
        "upsertCourierAccess",
        {
          userAccountId: courierUser,
          driverId,
          isActive: true,
          allowedDateMode: "todayOnly",
          canViewPhone: true,
          canViewCashCollection: true,
          canOpenNavigation: true,
        },
        state.rev,
        state.etag
      );
      if (!applyMutateMeta(m, state)) throw new Error(`upsertCourierAccess ${m.res.status} ${JSON.stringify(m.json)}`);
      log("CDV-LIVE-005", "PASS", "courier access active");
    }

    const courierLogin = await desktopLogin(courierUser, courierPass);
    courierToken = courierLogin.token;
    if (courierLogin.accountId !== "phase9a2-test-workspace" && !courierLogin.isTestWorkspace) {
      log("CDV-LIVE-006", "FAIL", "courier workspace mismatch");
    } else {
      log("CDV-LIVE-006", "PASS", "courier login");
    }

    // Courier forbidden on admin API
    {
      const res = await fetch(`${BASE}/api/desktop/snapshot`, {
        headers: { authorization: `Bearer ${courierToken}` },
      });
      if (res.status === 403) log("CDV-LIVE-007", "PASS", "desktop snapshot blocked");
      else log("CDV-LIVE-007", "FAIL", `status=${res.status}`);
    }

    {
      const res = await fetch(`${BASE}/api/courier/me`, {
        headers: { authorization: `Bearer ${courierToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok && json.driverId === driverId) log("CDV-LIVE-008", "PASS", "me ok");
      else log("CDV-LIVE-008", "FAIL", `${res.status} ${JSON.stringify(json)}`);
    }

    let routesJson;
    {
      const res = await fetch(`${BASE}/api/courier/routes?date=${today}`, {
        headers: { authorization: `Bearer ${courierToken}` },
      });
      routesJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        log("CDV-LIVE-009", "FAIL", `${res.status}`);
      } else {
        const routes = routesJson.routes || [];
        const mine = routes.find((r) => r.id === routeId);
        if (!mine) log("CDV-LIVE-009", "FAIL", "route missing");
        else if (mine.totalCashToCollect !== 450) log("CDV-LIVE-009", "FAIL", `total=${mine.totalCashToCollect}`);
        else if (!mine.serverTotalVerified) log("CDV-LIVE-009", "FAIL", "serverTotalVerified false");
        else if ((mine.stops || []).map((s) => s.sequence).join(",") !== "1,2")
          log("CDV-LIVE-009", "FAIL", "bad sequence");
        else log("CDV-LIVE-009", "PASS", `total=450 stops=${mine.stopCount}`);
      }
    }

    // Reorder stops
    if (stopIds.length >= 2) {
      const ordered = [stopIds[1], stopIds[0]];
      const m = await mutate(
        adminToken,
        "reorderRouteStops",
        { id: routeId, orderedStopIds: ordered },
        state.rev,
        state.etag
      );
      if (!applyMutateMeta(m, state)) log("CDV-LIVE-010", "FAIL", `reorder ${m.res.status}`);
      else {
        const res = await fetch(`${BASE}/api/courier/routes/${routeId}`, {
          headers: { authorization: `Bearer ${courierToken}` },
        });
        const json = await res.json().catch(() => ({}));
        const seqNames = (json.route?.stops || []).map((s) => `${s.sequence}:${s.customerName}`).join("|");
        if (res.ok && (json.route?.stops || [])[0]?.customerName === "לקוח ב")
          log("CDV-LIVE-010", "PASS", seqNames);
        else log("CDV-LIVE-010", "FAIL", seqNames);
      }
    }

    // Other route id should 403
    {
      const res = await fetch(`${BASE}/api/courier/routes/NOT-A-REAL-ROUTE`, {
        headers: { authorization: `Bearer ${courierToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 403 && !json.route) log("CDV-LIVE-011", "PASS", json.error || "403");
      else log("CDV-LIVE-011", "FAIL", `${res.status}`);
    }

    // Forbidden date
    {
      const res = await fetch(`${BASE}/api/courier/routes?date=2020-01-01`, {
        headers: { authorization: `Bearer ${courierToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 403 && json.error === "COURIER_DATE_FORBIDDEN") log("CDV-LIVE-012", "PASS", "date 403");
      else log("CDV-LIVE-012", "FAIL", `${res.status} ${json.error || ""}`);
    }

    // Revoke
    {
      const m = await mutate(
        adminToken,
        "revokeCourierAccess",
        { userAccountId: courierUser },
        state.rev,
        state.etag
      );
      if (!applyMutateMeta(m, state)) throw new Error(`revoke ${m.res.status} ${JSON.stringify(m.json)}`);
      const res = await fetch(`${BASE}/api/courier/me`, {
        headers: { authorization: `Bearer ${courierToken}` },
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 403 && !json.driverId) log("CDV-LIVE-013", "PASS", json.error || "revoked");
      else log("CDV-LIVE-013", "FAIL", `${res.status}`);
    }

    // Cleanup: cancel route + deactivate driver/vehicle + leave access revoked
    {
      applyMutateMeta(
        await mutate(adminToken, "cancelDeliveryRoute", { id: routeId, reason: "CDV cleanup" }, state.rev, state.etag),
        state
      );
      applyMutateMeta(await mutate(adminToken, "deactivateDriver", { id: driverId }, state.rev, state.etag), state);
      const v = await mutate(adminToken, "deactivateVehicle", { id: vehicleId }, state.rev, state.etag);
      if (applyMutateMeta(v, state)) log("CDV-LIVE-014", "PASS", "cleanup");
      else log("CDV-LIVE-014", "FAIL", `cleanup vehicle ${v.res.status}`);
    }
  } catch (e) {
    log("CDV-LIVE-FATAL", "FAIL", String(e.message || e));
  }

  const fail = results.filter((r) => r.status === "FAIL").length;
  const pass = results.filter((r) => r.status === "PASS").length;
  console.log(`SUMMARY pass=${pass} fail=${fail}`);
  const outDir = new URL("../qa-reports/courier-daily-view/", import.meta.url);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    new URL("COURIER_LIVE_SMOKE.json", outDir),
    JSON.stringify({ base: BASE, tag, pass, fail, results }, null, 2)
  );
  process.exit(fail > 0 ? 1 : 0);
}

main();
