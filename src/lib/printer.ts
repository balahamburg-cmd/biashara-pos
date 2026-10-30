"use client";

// Prints to cheap 58 mm Bluetooth (BLE) thermal printers with ESC/POS commands.
// Works in Chrome on Android, Windows, macOS and ChromeOS. iPhone browsers do not support Web Bluetooth.

const SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
];

let characteristic: BluetoothRemoteGATTCharacteristic | null = null;
let deviceName = "";

export const bluetoothSupported = () => typeof navigator !== "undefined" && "bluetooth" in navigator;
export const connectedPrinter = () => (characteristic ? deviceName || "Printer" : null);

export async function connectPrinter(): Promise<string> {
  if (!bluetoothSupported()) throw new Error("This browser cannot use Bluetooth. Use Chrome on Android or a computer.");
  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
  const server = await device.gatt!.connect();
  device.addEventListener("gattserverdisconnected", () => { characteristic = null; });
  for (const uuid of SERVICES) {
    try {
      const service = await server.getPrimaryService(uuid);
      for (const c of await service.getCharacteristics()) {
        if (c.properties.write || c.properties.writeWithoutResponse) {
          characteristic = c;
          deviceName = device.name ?? "Printer";
          return deviceName;
        }
      }
    } catch {
      // Service not on this printer; try the next one.
    }
  }
  device.gatt!.disconnect();
  throw new Error("Connected, but this printer did not offer a way to print. Check that it is an ESC/POS printer.");
}

const ESC = 0x1b, GS = 0x1d;

function encode(lines: string[]): Uint8Array {
  const text = lines.join("\n").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e\n]/g, "?");
  const body = new TextEncoder().encode(text);
  const init = [ESC, 0x40];
  const feedCut = [0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00];
  const out = new Uint8Array(init.length + body.length + feedCut.length);
  out.set(init, 0);
  out.set(body, init.length);
  out.set(feedCut, init.length + body.length);
  return out;
}

export async function printLines(lines: string[]) {
  if (!characteristic) await connectPrinter();
  const data = encode(lines);
  const chunk = 100; // BLE packets are small; send in pieces
  for (let i = 0; i < data.length; i += chunk) {
    const part = data.slice(i, i + chunk);
    if (characteristic!.properties.writeWithoutResponse) await characteristic!.writeValueWithoutResponse(part);
    else await characteristic!.writeValue(part);
  }
}
