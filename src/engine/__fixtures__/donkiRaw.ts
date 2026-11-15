/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */

// Raw DONKI records for tests, shaped like real API responses (field names, time
// format, null linkedEvents). The SEP IDs are real DONKI events; links are trimmed.

const view = (kind: string, n: number) => `https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/${kind}/${n}/-1`;

export const RAW_SEP = [
  { sepID: "2026-01-18T22:55:00-SEP-001", eventTime: "2026-01-18T22:55Z", instruments: [{ displayName: "GOES-P: SEISS >10 MeV" }],
    linkedEvents: [{ activityID: "2026-01-18T17:27:00-FLR-001" }], link: view("SEP", 44041) },
  // The same storm twice (re-sent), counted once.
  { sepID: "2026-01-18T22:55:00-SEP-001", eventTime: "2026-01-18T22:55Z", instruments: [{ displayName: "GOES-P: SEISS >10 MeV" }],
    linkedEvents: null, link: view("SEP", 44041) },
  // Seen only by STEREO-A, far from Earth: not a storm for the Moon.
  { sepID: "2024-01-29T05:11:00-SEP-001", eventTime: "2024-01-29T05:11Z", instruments: [{ displayName: "STEREO A: IMPACT 13-100 MeV" }],
    linkedEvents: null, link: view("SEP", 28836) },
  // The same day seen near Earth by SOHO: a storm.
  { sepID: "2024-01-29T06:08:00-SEP-001", eventTime: "2024-01-29T06:08Z", instruments: [{ displayName: "SOHO: COSTEP 15.8-39.8 MeV" }],
    linkedEvents: [{ activityID: "2024-01-29T03:54:00-FLR-001" }], link: view("SEP", 28844) },
  // A model prediction, not a measurement.
  { sepID: "2024-01-03T19:10:00-SEP-001", eventTime: "2024-01-03T19:10Z", instruments: [{ displayName: "MODEL: REleASE:ACE/EPAM 15.8-39.8 MeV" }],
    linkedEvents: null, link: view("SEP", 28467) },
  // Broken: no time.
  { sepID: "bad", instruments: [{ displayName: "GOES-P: SEISS >10 MeV" }], link: view("SEP", 1) },
];

export const RAW_FLR = [
  { flrID: "2026-01-18T17:27:00-FLR-001", catalog: "M2M_CATALOG", instruments: [{ displayName: "GOES-P: EXIS 1.0-8.0" }],
    beginTime: "2026-01-18T17:27Z", peakTime: "2026-01-18T18:09Z", endTime: "2026-01-18T18:40Z", classType: "X1.9",
    sourceLocation: "S12E10", activeRegionNum: 14341, linkedEvents: null, link: view("FLR", 44030) },
  { flrID: "2026-04-23T04:24:00-FLR-001", beginTime: "2026-04-23T04:24Z", peakTime: "2026-04-23T04:35Z", classType: "M1.6", linkedEvents: null, link: view("FLR", 45780) },
  { flrID: "2026-04-23T09:00:00-FLR-001", beginTime: "2026-04-23T09:00Z", peakTime: "2026-04-23T09:10Z", classType: "C4.9", linkedEvents: null, link: view("FLR", 45790) },
  { flrID: "2026-04-24T01:00:00-FLR-001", beginTime: "2026-04-24T01:00Z", peakTime: null, classType: "m2.0", linkedEvents: null, link: view("FLR", 45791) },
  { flrID: "no-class", beginTime: "2026-04-25T01:00Z", linkedEvents: null },
];

export const RAW_CME = [
  { time21_5: "2026-06-06T16:05Z", latitude: -3, longitude: -24, halfAngle: 44, speed: 1623, type: "O", isMostAccurate: true,
    associatedCMEID: "2026-06-06T14:11:00-CME-001", associatedCMELink: view("CME", 46690), catalog: "M2M_CATALOG" },
  { time21_5: "2026-05-14T11:11Z", speed: 319, type: "S", isMostAccurate: true, associatedCMEID: "2026-05-13T22:24:00-CME-001" },
  { time21_5: "2026-06-03T15:11Z", speed: 905, type: "C", isMostAccurate: true, associatedCMEID: "2026-06-03T11:48:00-CME-001" },
  { time21_5: "2026-06-03T15:30Z", speed: 950, type: "C", isMostAccurate: false, associatedCMEID: "2026-06-03T11:48:00-CME-001" },
];
