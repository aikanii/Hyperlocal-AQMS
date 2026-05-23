#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <HardwareSerial.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <WiFi.h>

// ═══════════════════════════════════════════════════════════════
//  HY-AQMS Firmware — ESP32 · DHT22 + PMS5003 → MQTT Dashboard
// ═══════════════════════════════════════════════════════════════

// ─── WiFi Config ─────────────────────────────────────────────
// ⚠  Replace with your actual network credentials
#define WIFI_SSID "your_SSID"
#define WIFI_PASSWORD "your_PASSWORD"

// ─── MQTT Config (Production SSL) ────────────────────────────
#define MQTT_BROKER "YOUR_PRODUCTION_DOMAIN" // e.g. "aqms.yourdomain.com"
#define MQTT_PORT 8883
#define MQTT_USERNAME "mydevice"
#define MQTT_PASSWORD "CHANGE_ME_SECURELY"

// Let's Encrypt ISRG Root X1 CA Certificate
// This allows the ESP32 to verify your server's identity.
const char* root_ca = \
"-----BEGIN CERTIFICATE-----\n" \
"MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n" \
"TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh\n" \
"cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4\n" \
"WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu\n" \
"ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY\n" \
"MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzmHtmVShG\n" \
"8UZB8GkgCyH3fHqTMp6K0S80C9/L9yIhhU991jB0m5y89gX+YJ1y4B2S0A1C1M1M\n" \
"-----END CERTIFICATE-----\n";

// ─── Device Identity ─────────────────────────────────────────
// Must match a device_id registered in the HY-AQMS dashboard
#define DEVICE_ID "msu_iit_campus_001"
#define MQTT_TOPIC "aqms/indoor/" DEVICE_ID "/data"

// ─── DHT22 Config ────────────────────────────────────────────
#define DHTPIN 4
#define DHTTYPE DHT22

// ─── PMS5003 Config ──────────────────────────────────────────
#define PMS_RX 16
#define PMS_TX 17
#define PMS_BAUD 9600
#define PMS_RETRIES 5      // attempts per reading cycle
#define PMS_TIMEOUT 5000   // ms to wait for a valid frame
#define PMS_WARMUP_MS 8000 // ms to let fan spin up on boot

// ─── Timing ──────────────────────────────────────────────────
// Send one packet per sensor node every 1 minute
#define READ_INTERVAL 60000 // ms between readings (1 min)

// ─── Objects ─────────────────────────────────────────────────
DHT dht(DHTPIN, DHTTYPE);
HardwareSerial pmsSerial(2);
WiFiClientSecure espClient;
PubSubClient mqtt(espClient);

// ─── PMS5003 Data Structure ──────────────────────────────────
struct PMS5003Data {
  uint16_t pm1_0_std, pm2_5_std, pm10_std;
  uint16_t pm1_0_atm, pm2_5_atm, pm10_atm;
  uint16_t raw_0_3um, raw_0_5um, raw_1_0um;
  uint16_t raw_2_5um, raw_5_0um, raw_10um;
};

// ─── State tracking ─────────────────────────────────────────
PMS5003Data lastGoodPMS;
bool pmsHasGoodData = false;
int pmsFailCount = 0;
int pmsSuccessCount = 0;

// ══════════════════════════════════════════════════════════════
//  WiFi Helpers
// ══════════════════════════════════════════════════════════════

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED)
    return;

  Serial.printf("  [WiFi] Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);

  // Handle open networks (no password)
  if (strlen(WIFI_PASSWORD) == 0) {
    WiFi.begin(WIFI_SSID);
  } else {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n  [WiFi] Connected — IP: %s  RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("\n  [WiFi] Connection FAILED — will retry next cycle");
  }
}

// ══════════════════════════════════════════════════════════════
//  MQTT Helpers
// ══════════════════════════════════════════════════════════════

void connectMQTT() {
  if (mqtt.connected())
    return;

  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setBufferSize(512); // ensure enough room for our JSON

  int attempts = 0;
  while (!mqtt.connected() && attempts < 5) {
    Serial.printf("  [MQTT] Connecting to %s:%d (attempt %d)...\n", MQTT_BROKER,
                  MQTT_PORT, attempts + 1);

    String clientId = "esp32_" DEVICE_ID "_";
    clientId += String(random(0xFFFF), HEX);

    if (mqtt.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("  [MQTT] Connected ✓");
    } else {
      Serial.printf("  [MQTT] Failed (rc=%d) — retrying in 3s\n", mqtt.state());
      delay(3000);
    }
    attempts++;
  }
}

void ensureConnected() {
  connectWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    connectMQTT();
  }
}

// ══════════════════════════════════════════════════════════════
//  PMS5003 — Parse one 32-byte frame
// ══════════════════════════════════════════════════════════════

bool parsePMSFrame(PMS5003Data &data) {
  unsigned long timeout = millis() + PMS_TIMEOUT;

  while (millis() < timeout) {
    if (pmsSerial.available() < 32)
      continue;

    if (pmsSerial.read() != 0x42)
      continue;
    if (pmsSerial.peek() != 0x4D)
      continue;
    pmsSerial.read(); // consume 0x4D

    uint8_t buf[30];
    int got = pmsSerial.readBytes(buf, 30);
    if (got != 30)
      continue;

    // Checksum verification
    uint16_t sum = 0x42 + 0x4D;
    for (int i = 0; i < 28; i++)
      sum += buf[i];
    uint16_t recv = (buf[28] << 8) | buf[29];
    if (sum != recv)
      continue;

    data.pm1_0_std = (buf[2] << 8) | buf[3];
    data.pm2_5_std = (buf[4] << 8) | buf[5];
    data.pm10_std = (buf[6] << 8) | buf[7];
    data.pm1_0_atm = (buf[8] << 8) | buf[9];
    data.pm2_5_atm = (buf[10] << 8) | buf[11];
    data.pm10_atm = (buf[12] << 8) | buf[13];
    data.raw_0_3um = (buf[14] << 8) | buf[15];
    data.raw_0_5um = (buf[16] << 8) | buf[17];
    data.raw_1_0um = (buf[18] << 8) | buf[19];
    data.raw_2_5um = (buf[20] << 8) | buf[21];
    data.raw_5_0um = (buf[22] << 8) | buf[23];
    data.raw_10um = (buf[24] << 8) | buf[25];
    return true;
  }
  return false;
}

// ══════════════════════════════════════════════════════════════
//  PMS5003 — Read with retries + fallback
//  Returns: 0 = fresh read, 1 = used cached, 2 = total failure
// ══════════════════════════════════════════════════════════════

int readPMS5003(PMS5003Data &data) {
  for (int attempt = 1; attempt <= PMS_RETRIES; attempt++) {
    while (pmsSerial.available())
      pmsSerial.read(); // flush stale
    delay(100);

    if (parsePMSFrame(data)) {
      lastGoodPMS = data;
      pmsHasGoodData = true;
      pmsSuccessCount++;
      pmsFailCount = 0;
      return 0;
    }

    Serial.printf("  [PMS] Attempt %d/%d failed, retrying...\n", attempt,
                  PMS_RETRIES);
  }

  pmsFailCount++;
  if (pmsHasGoodData) {
    data = lastGoodPMS;
    return 1; // cached
  }
  return 2; // total failure
}

// ══════════════════════════════════════════════════════════════
//  AQI (EPA PM2.5) Calculation
// ══════════════════════════════════════════════════════════════

int calcAQI_PM25(float pm) {
  const float bp[][4] = {
      {0.0, 12.0, 0, 50},       {12.1, 35.4, 51, 100},
      {35.5, 55.4, 101, 150},   {55.5, 150.4, 151, 200},
      {150.5, 250.4, 201, 300}, {250.5, 350.4, 301, 400},
      {350.5, 500.4, 401, 500},
  };
  for (auto &b : bp) {
    if (pm >= b[0] && pm <= b[1])
      return (int)((b[3] - b[2]) / (b[1] - b[0]) * (pm - b[0]) + b[2]);
  }
  return 500;
}

const char *aqiCategory(int aqi) {
  if (aqi <= 50)
    return "Good";
  if (aqi <= 100)
    return "Moderate";
  if (aqi <= 150)
    return "Unhealthy for Sensitive Groups";
  if (aqi <= 200)
    return "Unhealthy";
  if (aqi <= 300)
    return "Very Unhealthy";
  return "Hazardous";
}

// ══════════════════════════════════════════════════════════════
//  Build & Publish JSON to MQTT
// ══════════════════════════════════════════════════════════════

bool publishToMQTT(float temperature, float humidity, const PMS5003Data &pms,
                   int pmsStatus, bool dhtOk) {

  if (!mqtt.connected()) {
    Serial.println("  [MQTT] Not connected — skipping publish");
    return false;
  }

  JsonDocument doc;

  // PM data (atmospheric readings — what the dashboard expects)
  if (pmsStatus < 2) {
    doc["pm1_0"] = (float)pms.pm1_0_atm;
    doc["pm2_5"] = (float)pms.pm2_5_atm;
    doc["pm10"] = (float)pms.pm10_atm;
  } else {
    doc["pm1_0"] = (float)0;
    doc["pm2_5"] = (float)0;
    doc["pm10"] = (float)0;
  }

  // Temperature & humidity
  if (dhtOk) {
    doc["temperature"] = round(temperature * 100.0) / 100.0;
    doc["humidity"] = round(humidity * 100.0) / 100.0;
  } else {
    doc["temperature"] = (float)0;
    doc["humidity"] = (float)0;
  }

  // Device diagnostics
  doc["rssi_dbm"] = WiFi.RSSI();
  doc["battery_mv"] = 3300; // placeholder — replace with ADC read if available

  // Serialize
  char jsonBuffer[256];
  size_t len = serializeJson(doc, jsonBuffer, sizeof(jsonBuffer));

  // Publish to MQTT
  bool ok = mqtt.publish(MQTT_TOPIC, jsonBuffer);

  if (ok) {
    Serial.printf("  [MQTT] Published to %s (%d bytes)\n", MQTT_TOPIC, len);
    Serial.printf("  [MQTT] Payload: %s\n", jsonBuffer);
  } else {
    Serial.println("  [MQTT] Publish FAILED");
  }

  return ok;
}

// ══════════════════════════════════════════════════════════════
//  Setup
// ══════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  pmsSerial.begin(PMS_BAUD, SERIAL_8N1, PMS_RX, PMS_TX);
  dht.begin();

  Serial.println();
  Serial.println("╔══════════════════════════════════════════╗");
  Serial.println("║  HY-AQMS · ESP32 DHT22 + PMS5003 Node   ║");
  Serial.println("║  MQTT Dashboard Firmware v1.0            ║");
  Serial.println("╚══════════════════════════════════════════╝");

  // PMS5003 warm-up
  Serial.printf("  [PMS] Warming up for %d seconds", PMS_WARMUP_MS / 1000);
  for (int i = 0; i < PMS_WARMUP_MS / 1000; i++) {
    delay(1000);
    Serial.print(".");
  }
  Serial.println(" Ready!");

  // Network connection
  espClient.setCACert(root_ca); // Enable SSL certificate verification
  connectWiFi();
  connectMQTT();

  Serial.println("  [SYS] Setup complete — entering main loop");
  Serial.printf("  [SYS] Reading interval: %d seconds\n", READ_INTERVAL / 1000);
  Serial.printf("  [SYS] MQTT topic: %s\n", MQTT_TOPIC);
}

// ══════════════════════════════════════════════════════════════
//  Main Loop
// ══════════════════════════════════════════════════════════════

void loop() {
  // Keep MQTT alive between readings
  mqtt.loop();

  static unsigned long lastReading = 0;
  unsigned long now = millis();

  // First reading fires immediately, then every READ_INTERVAL
  if (lastReading != 0 && (now - lastReading) < READ_INTERVAL) {
    delay(100); // lightweight idle
    return;
  }
  lastReading = now;

  // Ensure connectivity before reading
  ensureConnected();

  // ── DHT22 ──────────────────────────────────────────────────
  float humidity = dht.readHumidity();
  float tempC = dht.readTemperature();
  float tempF = dht.readTemperature(true);
  float heatIndexC = dht.computeHeatIndex(tempC, humidity, false);
  float heatIndexF = dht.computeHeatIndex(tempF, humidity);
  bool dhtOk = !isnan(humidity) && !isnan(tempC);

  // ── PMS5003 ────────────────────────────────────────────────
  PMS5003Data pms;
  int pmsStatus = readPMS5003(pms);

  // ── Serial Output ─────────────────────────────────────────
  Serial.println("\n╔══════════════════════════════════════════╗");
  Serial.println("║            SENSOR READINGS               ║");
  Serial.println("╠══════════════════════════════════════════╣");

  Serial.println("║  DHT22 — Temperature & Humidity          ║");
  Serial.println("╠══════════════════════════════════════════╣");
  if (dhtOk) {
    Serial.printf("║  Temperature : %6.2f °C / %6.2f °F     ║\n", tempC, tempF);
    Serial.printf("║  Humidity    : %6.2f %%                  ║\n", humidity);
    Serial.printf("║  Heat Index  : %6.2f °C / %6.2f °F     ║\n", heatIndexC,
                  heatIndexF);
  } else {
    Serial.println("║  ERROR: DHT22 read failed!              ║");
  }

  Serial.println("╠══════════════════════════════════════════╣");
  Serial.println("║  PMS5003 — Air Quality                   ║");
  Serial.println("╠══════════════════════════════════════════╣");

  if (pmsStatus == 0) {
    Serial.printf("║  Status : Fresh read  (ok: %4d)         ║\n",
                  pmsSuccessCount);
  } else if (pmsStatus == 1) {
    Serial.printf("║  Status : CACHED (fails: %3d)  ⚠        ║\n",
                  pmsFailCount);
  } else {
    Serial.println("║  Status : NO DATA — sensor offline ✗    ║");
  }

  if (pmsStatus < 2) {
    int aqi = calcAQI_PM25(pms.pm2_5_atm);
    Serial.println("║  — Concentration (µg/m³) —              ║");
    Serial.printf("║  PM1.0 : %4d std | %4d atm             ║\n", pms.pm1_0_std,
                  pms.pm1_0_atm);
    Serial.printf("║  PM2.5 : %4d std | %4d atm             ║\n", pms.pm2_5_std,
                  pms.pm2_5_atm);
    Serial.printf("║  PM10  : %4d std | %4d atm             ║\n", pms.pm10_std,
                  pms.pm10_atm);
    Serial.println("║  — Particle Count (per 0.1L) —          ║");
    Serial.printf("║  >0.3µm: %5d | >0.5µm: %5d          ║\n", pms.raw_0_3um,
                  pms.raw_0_5um);
    Serial.printf("║  >1.0µm: %5d | >2.5µm: %5d          ║\n", pms.raw_1_0um,
                  pms.raw_2_5um);
    Serial.printf("║  >5.0µm: %5d | >10µm : %5d          ║\n", pms.raw_5_0um,
                  pms.raw_10um);
    Serial.println("║  — AQI (EPA, PM2.5) —                   ║");
    Serial.printf("║  AQI   : %3d  %-27s  ║\n", aqi, aqiCategory(aqi));
  }

  // ── Network Status ────────────────────────────────────────
  Serial.println("╠══════════════════════════════════════════╣");
  Serial.println("║  Network Status                          ║");
  Serial.println("╠══════════════════════════════════════════╣");
  Serial.printf("║  WiFi  : %-6s  RSSI: %d dBm            ║\n",
                WiFi.status() == WL_CONNECTED ? "OK" : "DOWN", WiFi.RSSI());
  Serial.printf("║  MQTT  : %-6s                           ║\n",
                mqtt.connected() ? "OK" : "DOWN");

  Serial.println("╚══════════════════════════════════════════╝");
  Serial.printf("  [Stats] PMS ok: %d  failed: %d\n", pmsSuccessCount,
                pmsFailCount);

  // ── Publish to Dashboard ──────────────────────────────────
  bool published = publishToMQTT(tempC, humidity, pms, pmsStatus, dhtOk);
  Serial.printf("  [SYS] Dashboard publish: %s\n\n",
                published ? "SUCCESS ✓" : "FAILED ✗");
}
