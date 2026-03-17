export const savedPlaces = [
  { id: "home", label: "Home", subtitle: "Chapinero Alto" },
  { id: "work", label: "Work", subtitle: "Zona T" }
];

export const nearbyStops = [
  {
    id: "calle-72",
    name: "Calle 72",
    distanceLabel: "4 min walk",
    departures: [
      { route: "B74", destination: "Portal Norte", eta: "3 min", realtime: true },
      { route: "M84", destination: "Portal Suba", eta: "9 min", realtime: false }
    ],
    alert: "Crowding reported on northbound service"
  },
  {
    id: "heroes",
    name: "Heroes",
    distanceLabel: "7 min walk",
    departures: [
      { route: "D20", destination: "Portal Sur", eta: "5 min", realtime: true },
      { route: "K16", destination: "Portal El Dorado", eta: "11 min", realtime: true }
    ]
  },
  {
    id: "virrey",
    name: "Virrey",
    distanceLabel: "9 min walk",
    departures: [
      { route: "L18", destination: "Portal 80", eta: "6 min", realtime: true },
      { route: "B11", destination: "Usme", eta: "14 min", realtime: false }
    ]
  }
];

export const sampleJourneys = [
  {
    id: "journey-fastest",
    label: "Fastest",
    departureTime: "5:40 PM",
    arrivalTime: "6:08 PM",
    duration: "28 min",
    walking: "7 min",
    transfers: 1,
    routes: ["B74", "L10"],
    alert: false,
    legs: [
      { kind: "Walk", detail: "Walk 4 min to Calle 72 station" },
      { kind: "Ride", detail: "Board B74 toward Portal Norte for 6 stops" },
      { kind: "Transfer", detail: "Switch to L10 and stay on for 4 stops" },
      { kind: "Walk", detail: "Walk 3 min to the destination" }
    ]
  },
  {
    id: "journey-fewer-transfers",
    label: "Fewer transfers",
    departureTime: "5:48 PM",
    arrivalTime: "6:20 PM",
    duration: "32 min",
    walking: "10 min",
    transfers: 0,
    routes: ["M84"],
    alert: true,
    legs: [
      { kind: "Walk", detail: "Walk 6 min to Heroes" },
      { kind: "Ride", detail: "Board M84 toward Portal Suba for 11 stops" },
      { kind: "Walk", detail: "Walk 4 min to the destination" }
    ]
  }
];

export const guidedTripStates = [
  {
    id: "walking_to_stop",
    title: "Walk to stop",
    detail: "Leave now for Calle 72. You have a 4 minute walk."
  },
  {
    id: "waiting_to_board",
    title: "Wait to board",
    detail: "B74 to Portal Norte is arriving in 2 minutes."
  },
  {
    id: "on_vehicle",
    title: "Ride in progress",
    detail: "Stay on for 6 stops. Next stop: Flores."
  },
  {
    id: "walking_transfer",
    title: "Transfer walk",
    detail: "Walk to platform L10. You have 2 minutes."
  },
  {
    id: "completed",
    title: "Arrived",
    detail: "Final stop reached. Walk 3 minutes to the destination."
  }
];
