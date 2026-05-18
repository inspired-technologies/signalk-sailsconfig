# Sail Configuration Transformation Instructions
```
Use the following steps to transform sail configuration files consistently and automatically.
Ask and wait for the original file to be either uploaded or its content being posted

1. Preserve the Overall Structure
Keep:
	• "configuration" (and its internal structure like "deltaInterval" and "sails")
	• "enabled"
Remove:
	• "putToken" — delete if present

2. Transform Each Object in configuration.sails[]
For each sail in the array:

- id
	• Keep exactly as-is (valid GUID with dashes)

- name
	• Remove numeric prefix before dash
e.g., "3-Main" → "Main"
Use regex: ^\d+-

- description
	• Set to:
    "Description (former label: [label value])"
    Example:
    "label": "genoa" → "description": "Description (former label: genoa)"

- label
	• Remove after transferring its value to description

- type
	• Convert to lowercase and map using this approved list:
    Valid types:
    - mainsail
    - jib
    - genoa
    - spinnaker
    - gennaker
    - staysail
    - headsail
    - lug
    - mizzen
    - steadying sail
    - other
    ○ Special case: "main" → "mainsail"
    ○ If not in the list → default to "other"

- material
	• Keep as-is

- brand
	• Keep as-is

- active
	• Set to false (default)

- area
	• Round to 1 decimal place

- minimumWind
	• Use wind.min
	• Default to 0 if missing

- maximumWind
	• Use wind.max
	• Default to 0 if missing

- reefs
	• Derived from states[], excluding "Full"
	• For each remaining state:
		○ reefArea = area × state.value
		○ Round each result to 2 decimal places
		○ Keep reef order intact

- reducedState
	• Always set to:
    {
    "reefs": 0,
    "furledRatio": 0
    }

3. Remove These Fields from Each Sail
	• "label"
	• "state"
	• "states"
	• "wind" (after extracting min and max)
```