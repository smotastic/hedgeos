# HedgeOS Domain Context

## Product boundary

The first HedgeOS slice covers a registered Shelly BLU Door/Window device,
observations of its contact state, persisted device state, and Telegram
notifications. TRV control and scheduling are later work for the winter scope.

## Glossary

### Home
The single local installation managed by HedgeOS. The first slice assumes one
home and does not model multi-home operation.

### Device
A physical Shelly unit known to HedgeOS. A device must be registered before its
observations participate in HedgeOS behavior.

### Registered device
A device with an explicitly accepted identity and enabled participation in the
home. Registration is distinct from discovery: seeing a device does not
implicitly register it.

### Observation
A fact reported by a device, including the contact state of a BLU Door/Window.
An observation describes what the device reported; it is not an instruction.

### Device state
The latest known state of a registered device, derived from observations. State
may be unknown until the first usable observation is received.

### State transition
A change from one known device state to another, such as `closed → open` or
`open → closed`. Repeated reports of the same state are not transitions.

### Automation
A configured trigger and action relationship. The first slice uses automations
only for BLU contact state changes that produce Telegram notifications. Future
automations may use time or device state to produce device commands.

### Trigger
A declarative predicate evaluated against available context, including previous
and current device state. A trigger may later also evaluate time or other
canonical facts. Repeated reports that leave state unchanged do not satisfy a
state-transition trigger.

### Action
An outcome requested when an automation trigger matches. The first slice
supports a Telegram notification action. Device command actions, such as
setting a TRV target temperature, are future scope.

### Notification
An external Telegram message produced by a notification action. The first
slice uses one configured destination and a generated message containing the
device, transition, and timestamp.

### Raw transport message
The message as received from the external transport, before normalization.

### Normalized observation
A canonical HedgeOS observation produced from a raw transport message, without
vendor-specific payload details.
