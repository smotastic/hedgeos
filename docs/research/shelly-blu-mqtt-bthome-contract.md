# Shelly BLU Door/Window MQTT/BTHome contract research

Ticket: [#8](https://github.com/smotastic/hedgeos/issues/8)

## Primary-source findings

- Shelly BLU devices broadcast the open BTHome format. Shelly's BLU
  documentation identifies BTHome as the common protocol for the BLU line and
  links to the BTHome specification:
  https://shelly-api-docs.shelly.cloud/docs-ble/
- The BTHome v2 service-data UUID is `0xFCD2` (represented in the advertising
  bytes as `D2 FC`). The device-information byte identifies encryption and
  BTHome version. Object IDs and values are encoded in the BTHome payload:
  https://bthome.io/format/
- The Shelly Gen2 MQTT adapter publishes RPC notifications on
  `<device-id>/events/rpc` by default. The device's MQTT `topic_prefix` may be
  used instead of the device ID. It also publishes online state on
  `<device-id>/online` and supports a custom topic prefix:
  https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Mqtt
- Shelly's BLU Gateway is a separate Gen2 device/API component. Its public
  device page documents gateway configuration but does not specify a
  canonical MQTT JSON schema for relayed BLU sensor observations:
  https://shelly-api-docs.shelly.cloud/gen2/Devices/Gen2/ShellyBluGw

## Narrow v1 contract

The ingestor should subscribe to the configured gateway's
`<topic_prefix>/events/rpc` (with the prefix resolved from configuration),
retain the complete received bytes/JSON as the immutable raw transport record,
and normalize only messages that can be validated as a BLU Door/Window contact
observation. The canonical observation must contain:

- an explicitly extracted BLU device identity (prefer the stable BLE address or
  vendor-provided stable ID, never the display name alone);
- contact state `open` or `closed`;
- the gateway receipt timestamp and, when present and trustworthy, the device
  occurrence timestamp;
- the source gateway identity and original MQTT topic for diagnostics.

The Shelly/BTHome decoder must validate the BTHome version, encryption status,
object framing, object length, and contact value before producing an
observation. Encrypted BTHome, malformed JSON, missing/ambiguous device
identity, unsupported object IDs, missing contact data, and invalid contact
values are rejected/quarantined as raw messages and do not update device state.
Illuminance, tilt, battery, button events, gateway health, and discovery are
not part of this vertical slice's normalized contract.

## Decision boundary left explicit

The primary Shelly documentation does not establish the exact relayed RPC
method/field names for a BLU Door/Window message over a BLU Gateway. Before
implementation, obtain one captured message from the target gateway firmware
(or a vendor-supported fixture) and freeze that adapter-specific envelope in a
contract test. Do not infer that envelope from the BTHome BLE bytes alone.
