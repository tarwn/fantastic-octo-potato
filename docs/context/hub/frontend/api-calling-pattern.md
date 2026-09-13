# Calling the scenario API from a component

Use this pattern when a front-end component needs to call a backend API.

Reference: TBD

* API calls are defined in a single file per noun/endpoint set
* API calls parse JSON into strongly typed types. Dates are parsed as they are received, not at every point of use
* Parameters to send to PUT and POST APIs are strongly typed, named after the event that is occurring
* Full types are defined in src/lib/types, event types are defined in API files
