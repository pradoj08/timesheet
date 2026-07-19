(function () {
  "use strict";

  const EMPTY_LIST = Object.freeze([]);
  const shared = Object.freeze({
    source: "Operational Knowledge Base and confirmed project decisions",
    sourceDocument: "Operational Knowledge Base - Project Revised - Strengthened.docx",
    sourceVersion: "2026-07-18",
    status: "confirmed",
    reviewStatus: "reviewed",
    lastReview: "2026-07-18",
    effectiveDate: null,
    supersededRuleReference: null,
    verificationRequired: false,
    confidence: "high",
    fields: EMPTY_LIST,
    metrics: EMPTY_LIST,
    identifiers: EMPTY_LIST,
    trainTypes: EMPTY_LIST,
    blocks: EMPTY_LIST
  });

  window.CONGLOBAL_OPS_KNOWLEDGE = {
    id: "settegast-operations-knowledge",
    title: "Settegast Operations Knowledge",
    version: "2026.07.18-foundation.2",
    reviewedAt: "2026-07-18",
    scope: "Local operational guidance for the all-in-one Settegast workbook",
    limitations: [
      "The local knowledge base can explain established rules and workflows without an AI provider.",
      "Live audits, forecasts, reconciliations, and record changes require a connected and validated page data adapter.",
      "Unknown, stale, or conflicting source values must remain visibly unresolved until a user validates them."
    ],
    statusDefinitions: {
      confirmed: "Reviewed operational knowledge that may be used as an established rule until it is superseded.",
      inferred: "A conclusion drawn from available evidence; it must be labeled and verified before operational use.",
      proposed: "A candidate rule or workflow that has not been approved for operational use.",
      superseded: "A historical rule retained for traceability; it must not drive current guidance.",
      unresolved: "A known question, conflict, or unknown value that requires user verification before use.",
      "verification-required": "A documented dependency whose operational value, threshold, owner, or formula must be confirmed by an authorized user before use."
    },
    entries: [
      {
        ...shared,
        id: "operating-principles",
        title: "Operating principles and decision safety",
        category: "governance",
        pages: ["all"],
        summary: "Preserve source truth, label assumptions, distinguish observed values from calculations, and require review before operational changes.",
        rules: [
          "Never invent an audit finding, forecast result, equipment identifier, chassis number, employee status, or operational event.",
          "Show the source, freshness, validation state, and conflicts for data used in a conclusion.",
          "Preview any proposed data change before confirmation; preserve an audit trail and an undo path.",
          "Use confidence labels and list missing inputs when the available evidence is incomplete."
        ],
        keywords: ["safety", "governance", "source", "truth", "assumption", "confidence", "change", "preview", "undo"]
      },
      {
        ...shared,
        id: "application-map",
        title: "Application pages and responsibilities",
        category: "application guidance",
        pages: ["all"],
        summary: "The project is one all-in-one HTML shell with embedded operational pages and shared browser storage.",
        details: [
          "Matrix and Matrix Wide visualize the yard and scenarios.",
          "Excel View manages ramp blocking, inbound planning, dwell, split views, calculations, and archives.",
          "Billing contains Operations, Analytics, and Performance views.",
          "Timesheet MD, Time Off, Roster, and AM Report support workforce planning and timekeeping.",
          "Chassis Status summarizes inbound chassis demand, on-hand inventory, bad order, net position, and requests.",
          "Checklist and Audits support repeatable control work."
        ],
        keywords: ["page", "where", "navigation", "matrix", "excel view", "billing", "timesheet", "chassis", "checklist", "audit"]
      },
      {
        ...shared,
        id: "data-lineage",
        title: "Data lineage and source precedence",
        category: "data interpretation",
        pages: ["all"],
        summary: "Imported records are observations; user edits are overrides; derived values are calculations; scenarios are planning assumptions.",
        rules: [
          "Retain the original imported value when a user creates an override.",
          "Label calculated, inferred, simulated, forecasted, and manually entered values distinctly.",
          "If two sources disagree, present the conflict instead of silently choosing one.",
          "A data adapter must report source name, import time, data time, validation state, and transformation history."
        ],
        fields: ["source", "sourceTimestamp", "importedAt", "validatedAt", "transformation", "conflicts"],
        keywords: ["lineage", "source", "import", "override", "calculated", "derived", "conflict", "freshness"]
      },
      {
        ...shared,
        id: "rail-track-capacity",
        title: "Rail track capacities and visual scaling",
        category: "rail operations",
        pages: ["matrix", "matrixWide", "excelView"],
        summary: "Track footage is the physical planning limit; the Matrix visual is capped at sixteen railcars and scales the displayed car count.",
        rules: [
          "Track 801 capacity: 1,750 ft.",
          "Track 802 capacity: 1,750 ft.",
          "Track 803 capacity: 2,200 ft.",
          "Track 804 capacity: 2,500 ft.",
          "Track 805 capacity: 2,500 ft.",
          "Track 806 capacity: 2,600 ft.",
          "Track 807 capacity: 2,750 ft.",
          "Track 808 capacity: 2,500 ft.",
          "Track 809 capacity: 2,500 ft.",
          "Use 77 ft per railcar for planning conversion.",
          "Never display more than sixteen railcars on a Matrix track; scale proportionally while retaining the true footage in data and labels."
        ],
        formulas: ["remaining footage = track capacity - current footage", "estimated cars = current footage / 77"],
        fields: ["track", "capacityFt", "currentFt", "remainingFt", "visualCars"],
        metrics: ["feet", "railcars"],
        keywords: ["track", "capacity", "801", "802", "803", "804", "805", "806", "807", "808", "809", "77 feet", "cars", "remaining"]
      },
      {
        ...shared,
        id: "daily-inbound-priority",
        title: "Daily inbound ordering",
        category: "inbound planning",
        pages: ["excelView", "chassisStatus"],
        summary: "Within each day, list ZPBHO and ZG4MQ inbounds before ZLBHO inbounds.",
        rules: [
          "Apply the same ordering to the on-screen daily cards and exported Excel output.",
          "Preserve the existing order within the same train family unless an explicit operational priority changes it.",
          "Duplicate labels and unresolved identifiers remain visible for review."
        ],
        trainTypes: ["ZPBHO", "ZG4MQ", "ZLBHO"],
        keywords: ["inbound", "order", "priority", "zpbho", "zg4mq", "zlbho", "daily", "excel"]
      },
      {
        ...shared,
        id: "ramp-blocking",
        title: "Ramp blocking workflow",
        category: "ramp planning",
        pages: ["excelView"],
        summary: "Ramp blocks are movable planning objects with footage, track placement, dwell/status attributes, selection, split, delete, archive, and undo workflows.",
        rules: [
          "A click selects one block; Ctrl-click adds or removes blocks from a multi-selection.",
          "Selected blocks may be moved in front of another block or appended to a target track.",
          "The same move and delete model applies to the first, second, and third ramp tables.",
          "Right-click deletion, block edits, moves, and splits must be undoable.",
          "Splitting preserves total footage: block 1 footage plus block 2 footage equals the original footage.",
          "Unknown hour values displayed as ?? remain unknown; do not convert them into a different symbol or numeric assumption."
        ],
        fields: ["track", "block", "footage", "cars", "loads", "mty", "weight", "status", "arrival", "dwell"],
        keywords: ["block", "blocking", "move", "drag", "split", "undo", "delete", "track", "footage", "unknown", "question marks"]
      },
      {
        ...shared,
        id: "inbound-archive",
        title: "Inbound archive controls",
        category: "records management",
        pages: ["excelView"],
        summary: "An archived inbound is a preserved copy for future reference, with preview, edit, restore, and delete controls.",
        rules: [
          "The archive indicator appears next to the inbound close control.",
          "Archive records keep inbound name, arrival, status, total footage, units, block rows, archive timestamp, and source identity.",
          "Archive editing may add block rows and must not alter the live inbound unless the user explicitly restores it.",
          "Restore requires a preview when it could overwrite a current record."
        ],
        keywords: ["inbound archive", "archived", "preview", "restore", "saved inbound", "edit archive"]
      },
      {
        ...shared,
        id: "current-work-math",
        title: "Live Current Work calculations",
        category: "work forecasting",
        pages: ["excelView", "matrix", "matrixWide"],
        summary: "Current Work converts inbound and outbound lift counts plus delay allowances into projected work hours and a projected release time.",
        rules: [
          "Lifts equals the inbound count plus the outbound count.",
          "Estimated productive hours equals lifts divided by LPH target when the LPH target is greater than zero.",
          "Total time includes estimated productive hours plus selected Z-train, lunch, and shift-change allowances.",
          "Z-train, lunch, and shift-change allowances use 0, 0.5, 1, or 1.5 hours.",
          "Projected release equals current time plus total projected time.",
          "When IHOSA is selected, use the configured same-day 17:00 release anchor; when MHOAS is selected, use the configured next-day 03:00 anchor.",
          "LPH required to meet a target is only valid when remaining available hours are positive."
        ],
        formulas: ["lifts = inbound + outbound", "estimated hours = lifts / LPH target", "projected release = now + total projected hours"],
        metrics: ["lifts", "LPH", "hours", "release time"],
        keywords: ["current work", "lph target", "lifts", "estimated hours", "z-train", "lunch", "shift change", "projected release", "ihosa", "mhoas"]
      },
      {
        ...shared,
        id: "matrix-live-look",
        title: "Matrix Live Look and scenario controls",
        category: "yard simulation",
        pages: ["matrix", "matrixWide"],
        summary: "Live Look visualizes validated source data; Scenario Test follows the configured order of operations and remains separate from observed data.",
        rules: [
          "Live Look starts paused until the user explicitly starts it.",
          "When paused at initialization, hostlers stage at employee parking and cranes stage at the crane pad with mechanics working on them.",
          "Order-of-operations rows stay blank until the user selects a track and operation.",
          "Scenario execution follows the first populated operation, then proceeds in numerical order.",
          "Scenario animation does not change imported source data.",
          "Stop and restart controls must leave a clear state and avoid duplicate simulation timers."
        ],
        fields: ["mode", "track", "operation", "sequence", "craneLphTarget", "flipLphTarget", "paused"],
        keywords: ["matrix", "live look", "scenario", "paused", "start", "stop", "restart", "order of operations", "drop", "load"]
      },
      {
        ...shared,
        id: "matrix-rail-work",
        title: "Crane, hostler, and rail placement rules",
        category: "yard simulation",
        pages: ["matrix", "matrixWide"],
        summary: "Cars, cranes, chassis, and containers must stay aligned to the selected work track and the correct side of the track.",
        rules: [
          "A crane must not visually unload or load a container until the corresponding lift action occurs.",
          "Hostler chassis setup must not cause a top-position train container to shift down.",
          "Trackside containers retain the same detailed size and proportions used on the train and sit on a chassis.",
          "For a configured 808 drop scenario, cars spot on 808, the crane works the adjacent assigned service position, and boxes stage on the configured opposite side; do not mix 808 and 809 state.",
          "Outbound hostler work must resume after unloading when outbound work exists."
        ],
        keywords: ["crane", "hostler", "trackside", "container", "chassis", "load", "unload", "808", "809", "position"]
      },
      {
        ...shared,
        id: "container-and-car-visual-semantics",
        title: "Railcar and container visual semantics",
        category: "yard visualization",
        pages: ["matrix", "matrixWide"],
        summary: "Visual treatment communicates operational class while labels preserve the block text used by planning.",
        rules: [
          "SS and BO cuts are empty-car presentations; BO uses the red empty-car treatment.",
          "SL and DB cars use the same detailed railcar construction and readable label treatment as SS cars while retaining their own block label and color meaning.",
          "Block text is larger, wraps when necessary, and is not obscured by decorative logos.",
          "Parked and trackside containers keep train-container proportions and show a visible top-down chassis, wheels, and chassis legs."
        ],
        keywords: ["ss", "bo", "sl", "db", "empty cars", "railcar", "container", "label", "logo", "chassis"]
      },
      {
        ...shared,
        id: "gate-events",
        title: "Gate events, queues, and notification bubbles",
        category: "gate operations",
        pages: ["matrix", "billing"],
        summary: "Gate animation uses imported event timing and equipment/chassis identifiers; it must not create a second synthetic event population.",
        rules: [
          "Ingate bubbles are blue, outgate bubbles are yellow, and refusal bubbles are red.",
          "Ingate notifications appear on the left side of the gate and outgate notifications on the right so they can appear side by side.",
          "Display the actual equipment ID and chassis from the imported gate record; do not display placeholder labels such as EQUIPMENT: or CHASSIS:.",
          "At most five notifications stack per side and they clear promptly.",
          "A refusal includes a brief driver/clerk conversation, a turn-around, and a temporary queue for following drivers.",
          "Remove separately generated outbound-load-in trucks when they are not part of imported gate data."
        ],
        fields: ["event", "eventTime", "equipmentId", "chassisId", "direction", "refusalReason"],
        keywords: ["gate", "ingate", "outgate", "refusal", "bubble", "equipment id", "chassis", "queue", "driver"]
      },
      {
        ...shared,
        id: "flip-line",
        title: "Flip line throughput and exchange workflow",
        category: "flip operations",
        pages: ["matrix", "billing"],
        summary: "The visible flip count should reconcile to the reported archive while the animation shows the established driver handoff sequence.",
        rules: [
          "Outside driver exits the truck, walks to the swing line with paperwork, returns to the truck, and then the swing occurs.",
          "Speed up the exchange and walk animation when more than three drivers are queued.",
          "The total visible swings for the reporting period must reconcile with the archive count; animation speed may compress time but must not change the count.",
          "A flip-line container uses the same detailed container size as an inbound train container and sits on a chassis."
        ],
        metrics: ["swings", "queue length", "turn time"],
        keywords: ["flip", "swing line", "swings", "driver", "paperwork", "queue", "archive", "operator"]
      },
      {
        ...shared,
        id: "mechanic-workflow",
        title: "Mechanic and equipment inspection workflow",
        category: "maintenance",
        pages: ["matrix", "checklist"],
        summary: "Mechanics work on staged equipment and perform recurring hostler inspections without creating unrealistic vehicle movement.",
        rules: [
          "When both mechanics are working, one may work on the broken hostler and the other on the white service truck.",
          "Mechanics drive to employee parking twice per day for a hostler inspection, then walk to a hostler that pulls up; they do not drive the service truck to the hostler.",
          "For a two-mechanic inspection, show one mechanic on each side of the hostler.",
          "An occasional hostler driver may stop for a brief check; only one mechanic leaves the primary repair momentarily unless the work plan says otherwise."
        ],
        keywords: ["mechanic", "hostler repair", "inspection", "white truck", "parking lot", "walk", "twice a day"]
      },
      {
        ...shared,
        id: "workforce-status",
        title: "Workforce status and roster interpretation",
        category: "workforce",
        pages: ["timeMd", "timeOff", "roster", "amReport", "matrix"],
        summary: "Roster and attendance views distinguish scheduled, here, assignment, and absence states while preserving the selected date and shift.",
        rules: [
          "A user can clear an existing quick-status selection rather than being forced to choose a replacement.",
          "Employees marked Out are displayed in red in the full roster view.",
          "Role and assignment labels are contextual and do not replace the underlying employee identity.",
          "The current-day roster popup is read-only unless an explicit edit workflow is entered."
        ],
        fields: ["employee", "date", "shift", "status", "assignment", "offDays"],
        keywords: ["roster", "employee", "out", "here", "vacation", "status", "shift", "assignment"]
      },
      {
        ...shared,
        id: "timesheet-missing-punch",
        title: "Timesheet missing-punch audit",
        category: "timekeeping audit",
        pages: ["timeMd"],
        summary: "Archive parsing flags a workday when an employee has an incomplete required start/end punch; missing lunches are ignored.",
        rules: [
          "Evaluate each employee row in the saved timesheet for the selected day.",
          "A scheduled or worked row with only one of the required start/end values is a missing-punch candidate.",
          "Do not flag a row solely because lunch is blank, missing, or marked NO.",
          "Show the affected employee name in the day detail and mark the calendar day without modifying the saved timesheet."
        ],
        fields: ["employee", "scheduled", "start", "end", "lunch", "actualHours"],
        keywords: ["timesheet", "archive", "missing punch", "incomplete time", "start", "end", "lunch", "calendar flag"]
      },
      {
        ...shared,
        id: "performance-metrics",
        title: "Lift performance metrics",
        category: "performance",
        pages: ["billing", "matrix", "excelView"],
        summary: "Performance separates observed lifts, labor hours, LPH, best hour, sources, shifts, and flip activity.",
        rules: [
          "LPH means lifts per hour and requires a declared numerator and hour basis; label whether the denominator is clock hours, activity hours, productive hours, labor hours, or another approved basis.",
          "Overall actual LPH must not be compared to a target calculated on a different time basis without an explanation.",
          "When labor hours are used, identify the included crew and the treatment of paid-off or nonproductive time.",
          "A blank or zero target, or a non-positive remaining time window, invalidates a normal duration or required-rate result.",
          "A best-hour value requires a complete hour interval and a validated lift count.",
          "Shift totals must reconcile to the underlying employee/lift sources before being described as final."
        ],
        formulas: ["LPH = qualifying lifts / declared applicable hour basis", "estimated production hours = lifts / positive LPH target", "required LPH = lifts / positive hours remaining", "LPH variance = current LPH - target LPH"],
        metrics: ["lifts", "labor hours", "LPH", "best hour", "people", "flips"],
        keywords: ["performance", "lifts", "labor", "lph", "best hour", "shift", "source mix"]
      },
      {
        ...shared,
        id: "lpmh-definition-gap",
        title: "LPMH definition requires authorization",
        category: "staffing and productivity",
        pages: ["billing", "matrix", "excelView"],
        status: "unresolved",
        confidence: "high",
        verificationRequired: true,
        summary: "The knowledge document states that LPH and LPMH are meaningful but non-interchangeable, but it does not define or provide a formula for LPMH.",
        rules: [
          "Do not expand or calculate LPMH until an authorized user approves its numerator, denominator, included crew, paid/off-time treatment, and work window.",
          "A possible meaning such as lifts per man-hour is only an inference and must not be used operationally."
        ],
        unresolvedQuestions: ["Approved LPMH expansion", "Qualifying lift numerator", "Labor-hour denominator", "Included employees", "Paid-off-time treatment", "Applicable work window"],
        metrics: ["LPH", "LPMH", "lifts", "labor hours"],
        keywords: ["lpmh", "man hour", "labor hour", "productivity", "denominator", "definition", "unresolved"]
      },
      {
        ...shared,
        id: "ss-dwell-timers",
        title: "SS and dwell timestamp calculations",
        category: "dwell and holds",
        pages: ["excelView", "matrix", "matrixWide"],
        summary: "SS and dwell calculations require their documented timestamps and must preserve blanks and unresolved values rather than substituting assumptions.",
        rules: [
          "Arrival-to-SS equals SS start minus arrival only when both timestamps exist.",
          "SS interval equals SS end minus SS start; SS greater than 24 is true only when that interval exceeds 24 hours.",
          "SS start and end may be imported, pasted, or manually resolved, but must remain paired to the correct block or car.",
          "A blank required timestamp remains blank and produces no derived dwell; literal ?? remains unresolved.",
          "Weighted dwell uses the value inside parentheses, not the displayed SS-hour text; the final aggregation formula remains unresolved."
        ],
        formulas: ["arrival-to-SS = SS start - arrival", "SS interval = SS end - SS start", "SS greater than 24 = SS interval > 24 hours"],
        fields: ["arrival", "ssStart", "ssEnd", "arrivalToSs", "ssInterval", "weightedDwell"],
        keywords: ["ss", "dwell", "timer", "timestamp", "arrival to ss", "greater than 24", "weighted dwell", "blank"]
      },
      {
        ...shared,
        id: "ss-hold-policy-gap",
        title: "SS hold and 20:30 dwell policy",
        category: "dwell and holds",
        pages: ["excelView", "matrix", "matrixWide"],
        status: "verification-required",
        confidence: "high",
        verificationRequired: true,
        summary: "Dwell at 20:30 is described only as a projected or normalized reference; the hold policy and timer behavior are not defined enough for operational use.",
        rules: [
          "Do not infer hold eligibility, thresholds, cutoff inclusivity, required actions, or train/customer-specific treatment.",
          "Do not assume whether a hold timer counts up or down, pauses, resets, or escalates.",
          "Require an authorized policy owner to define timezone, operational-day treatment, hold matrix, timer behavior, and escalation before activation."
        ],
        unresolvedQuestions: ["Hold eligibility", "20:30 formula", "Cutoff inclusivity", "Timezone", "Thresholds", "Required action", "Pause/reset/escalation behavior"],
        keywords: ["ss hold", "hold", "dwell 2030", "20:30", "timer reset", "timer pause", "verification"]
      },
      {
        ...shared,
        id: "documented-time-windows",
        title: "Documented operational time references",
        category: "time rules",
        pages: ["excelView", "timeMd", "matrix", "billing"],
        summary: "The documented time references cover Current Work anchors, overnight handling, roster intervals, and UPS proximity warnings—not a general train acceptance window.",
        rules: [
          "IHOSA uses today at 17:00 and MHOAS uses tomorrow at 03:00 as configured Current Work reference times.",
          "Hours until release equals the selected reference minus current local time; a negative result means the reference has passed.",
          "After-midnight arrivals or shifts belong to the next operational day when context requires it.",
          "The default scheduled roster interval is 03:00-15:00; a 15:00-03:00 night interval wraps midnight.",
          "A UPS warning occurs when estimated arrival is within two hours of commitment, including overnight parsing.",
          "Daily inbound ordering never changes imported arrival timestamps."
        ],
        fields: ["arrival", "commitment", "releaseReference", "operationalDay", "shiftStart", "shiftEnd"],
        keywords: ["time window", "arrival", "departure", "ihosa", "mhoas", "overnight", "ups", "commitment", "operational day"]
      },
      {
        ...shared,
        id: "arrival-departure-policy-gap",
        title: "General arrival and departure windows",
        category: "time rules",
        pages: ["excelView", "matrix", "chassisStatus"],
        status: "verification-required",
        confidence: "high",
        verificationRequired: true,
        summary: "The reviewed documents do not define general train arrival/departure windows, tolerance bands, or cutoff actions.",
        rules: [
          "Do not treat IHOSA/MHOAS display rows or roster intervals as general train acceptance windows.",
          "Before implementing a window, confirm applicable trains/customers, early/late tolerance, timezone, hold/release/escalation action, and approving owner."
        ],
        unresolvedQuestions: ["Applicable trains/customers", "Early/late tolerance", "Timezone", "Cutoff action", "Approving owner"],
        keywords: ["arrival window", "departure window", "tolerance", "late", "early", "cutoff", "verification"]
      },
      {
        ...shared,
        id: "pivot-indicators-inferred",
        title: "Candidate operational pivot indicators",
        category: "forecasting",
        pages: ["excelView", "matrix", "chassisStatus", "billing"],
        status: "inferred",
        confidence: "medium",
        verificationRequired: true,
        summary: "No approved pivot policy exists; the documented risk responses suggest possible decision indicators that require authorization before they become pivot rules.",
        rules: [
          "Candidate only: negative remaining track footage may indicate reblocking review.",
          "Candidate only: projected release later than the requirement may indicate escalation.",
          "Candidate only: negative chassis net may indicate a request or rebalance review.",
          "Candidate only: a non-positive release window means the deadline has passed and a normal required-rate answer should be withheld.",
          "Candidate only: unavailable staff or equipment should prevent a simple recommendation to increase LPH."
        ],
        keywords: ["pivot", "decision", "reblock", "escalate", "negative capacity", "negative chassis", "staffing", "inferred"]
      },
      {
        ...shared,
        id: "pivot-workflow-proposal",
        title: "Proposed pivot decision workflow",
        category: "forecasting",
        pages: ["excelView", "matrix", "chassisStatus", "billing"],
        status: "proposed",
        confidence: "low",
        verificationRequired: true,
        summary: "A future pivot workflow could combine validated triggers, authorized decision owners, previews, approvals, reversal criteria, and an audit trail, but it is not an approved operating rule.",
        rules: [
          "A future workflow must define what constitutes a pivot, its thresholds, decision authority, approval, reversal, and audit requirements.",
          "Until those items are approved, YardMate may identify documented risks but must not recommend or execute a pivot as a confirmed rule."
        ],
        keywords: ["pivot workflow", "proposal", "approval", "authority", "reversal", "audit trail", "planned"]
      },
      {
        ...shared,
        id: "operational-glossary",
        title: "Operational glossary and abbreviations",
        category: "operational glossary",
        pages: ["all"],
        summary: "The glossary defines project terminology while preserving abbreviations whose expansions were not documented.",
        rules: [
          "LPH means lifts per hour; LPMH is not defined in the source.",
          "MTY denotes empty equipment or count; NCNS denotes no call/no show; Z-train is the train-related delay allowance in Current Work.",
          "Track delta means capacity minus current footage.",
          "ZPBHO, ZG4MQ, and ZLBHO are inbound families; ZPBHO and ZG4MQ precede ZLBHO within a day.",
          "FGCP, TGRP, SNCZ, and DCLI are chassis-pool identifiers.",
          "Do not invent expansions for SS, IHOSA, or MHOAS; use their documented operational behavior instead."
        ],
        keywords: ["glossary", "term", "abbreviation", "lph", "lpmh", "mty", "ncns", "ss", "ihosa", "mhoas", "z-train", "track delta"]
      },
      {
        ...shared,
        id: "known-exceptions-and-edge-cases",
        title: "Known operational exceptions and edge cases",
        category: "warnings and exceptions",
        pages: ["all"],
        summary: "Known exceptions preserve source truth and require visible review instead of silent correction.",
        rules: [
          "An unmatched forecast inbound is flagged, keeps its train identity, and remains editable.",
          "Duplicate or differently formatted train names are normalized for matching while source labels and unresolved duplicates remain visible.",
          "After-midnight arrival or shift times attach to the next operational day when required.",
          "If Matrix disagrees with the spreadsheet block state, the spreadsheet source controls and visualization parity is repaired without changing source data.",
          "A two-device cloud conflict stops automatic continuation; compare revisions or exports and restore deliberately.",
          "Weather conflicts show source, observation/forecast timestamp, and cache age.",
          "Track 803 remains holding/special; its presence does not imply crane or live-work permission."
        ],
        keywords: ["exception", "edge case", "duplicate", "unmatched", "overnight", "matrix mismatch", "cloud conflict", "weather", "track 803"]
      },
      {
        ...shared,
        id: "verification-register",
        title: "Operational rules requiring verification",
        category: "unresolved questions",
        pages: ["all"],
        status: "unresolved",
        confidence: "high",
        verificationRequired: true,
        summary: "The knowledge document retains an explicit register of items that must not be treated as settled operating rules.",
        rules: [
          "Verify cloud revision/conflict protection and atomic equipment replacement behavior.",
          "Verify Matrix/Matrix Wide parity, weather freshness/reconciliation, and mass-export completeness.",
          "Verify dwell-at-20:30 and hold policy, LPMH definitions, and Track 803 operating exceptions.",
          "Verify deployment security, row-level authorization, and credential cleanup before public operational use."
        ],
        keywords: ["unresolved", "verification", "open question", "known limitation", "security", "matrix parity", "weather", "track 803", "hold"]
      },
      {
        ...shared,
        id: "superseded-operating-rules",
        title: "Superseded operating and interface rules",
        category: "governance",
        pages: ["all"],
        status: "superseded",
        confidence: "high",
        verificationRequired: false,
        supersededRuleReference: "Operational Knowledge Base - Project Revised - Strengthened v2, Section 20",
        summary: "These historical rules are retained only for traceability; the Strengthened v2 Section 20 decisions control where they conflict.",
        rules: [
          "Historical: a single-file upload alone was assumed sufficient; current packaging must test every embedded surface and declare external assets.",
          "Historical: Flip Line was an attendance state; current behavior treats Flip Operator as a role.",
          "Historical: roster consumers used separate models; the Timesheet current-day roster is now authoritative.",
          "Historical: yesterday, today, and tomorrow AM values mirrored one another; current values are independent and share formatting only.",
          "Historical: Live Look started automatically; current movement is explicitly user-controlled."
        ],
        keywords: ["superseded", "historical", "old rule", "previous", "section 20", "live look auto start", "flip line attendance"]
      },
      {
        ...shared,
        id: "chassis-status",
        title: "Chassis status calculation and presentation",
        category: "chassis planning",
        pages: ["chassisStatus"],
        summary: "Chassis planning compares inbound need, on-hand inventory, bad-order units, and net availability across 24-hour and 72-hour horizons.",
        rules: [
          "Present the 24-hour calculator first, the 72-hour calculator second, and chassis requests last.",
          "Net chassis availability equals on hand minus inbound requirement minus bad order unless the configured business rule explicitly defines a different sign convention.",
          "Show positive and negative differences without surrounding parentheses.",
          "Daily train cards list ZPBHO and ZG4MQ before ZLBHO.",
          "Popups remain near the top of the viewport and are constrained on resize."
        ],
        formulas: ["net = on hand - inbound - bad order"],
        fields: ["pool", "size", "inbound", "onHand", "badOrder", "net", "horizon"],
        keywords: ["chassis", "24h", "72h", "request", "pool", "tgrp", "fgcp", "sncz", "dcli", "net", "bad order"]
      },
      {
        ...shared,
        id: "forecast-requirements",
        title: "Forecast minimum inputs and validation",
        category: "forecasting",
        pages: ["matrix", "excelView", "billing", "chassisStatus"],
        summary: "A forecast is only calculated after its workload, rate, time window, staffing/equipment constraints, delay allowances, and data freshness are known.",
        rules: [
          "Required workload inputs include remaining lifts, footage, cars, moves, or chassis demand appropriate to the question.",
          "Required capacity inputs include LPH or throughput target, available hours, staffing, equipment availability, and known outages/delays.",
          "State assumptions and provide a range when uncertainty is material.",
          "Do not label a locally calculated scenario as an AI prediction."
        ],
        fields: ["workload", "rate", "availableHours", "staffing", "equipment", "delays", "freshness"],
        keywords: ["forecast", "project", "estimate", "release", "target", "how long", "what if", "scenario", "assumptions"]
      },
      {
        ...shared,
        id: "audit-requirements",
        title: "Audit and reconciliation controls",
        category: "auditing",
        pages: ["audits", "excelView", "billing", "timeMd", "chassisStatus"],
        summary: "Audits compare defined sources over a defined scope and report evidence, exceptions, confidence, and unresolved conflicts.",
        rules: [
          "Define the date/shift/train/track/employee scope before running an audit.",
          "Name the source on both sides of a reconciliation and their freshness.",
          "Report zero findings as zero; never populate a sample exception as if it were real.",
          "A finding includes the rule tested, observed values, expected values, source references, severity, and suggested review action.",
          "The user confirms any corrective action after preview."
        ],
        keywords: ["audit", "reconcile", "finding", "exception", "mismatch", "missing", "evidence", "severity"]
      },
      {
        ...shared,
        id: "provider-security",
        title: "AI provider and credential security",
        category: "security",
        pages: ["all"],
        summary: "Production AI credentials belong in a secure server-side gateway, never in this downloadable HTML, browser storage, logs, chat history, or exports.",
        rules: [
          "The frontend may store non-secret preferences such as provider label, model label, tone, and response length.",
          "A connection test is available only when a secure gateway adapter is injected by the deployment environment.",
          "Disconnecting clears local non-secret connection metadata; rotating or deleting a real credential occurs on the secure server.",
          "Local knowledge guidance remains available while the AI provider is disconnected."
        ],
        keywords: ["ai", "api", "key", "credential", "provider", "model", "connect", "security", "server", "privacy"]
      },
      {
        ...shared,
        id: "assistant-permissions",
        title: "Assistant permissions and action boundaries",
        category: "security",
        pages: ["all"],
        summary: "The assistant can explain local knowledge by default; reading live page data and proposing or applying changes are separate permissions.",
        rules: [
          "Reading a page context does not grant permission to edit that page.",
          "Information gathering does not automatically send data outside the application.",
          "Suggested changes require a preview, explicit confirmation, audit entry, and undo path.",
          "External requests and notifications are opt-in and must show their destination and payload summary."
        ],
        keywords: ["permission", "privacy", "read", "write", "action", "confirm", "external", "notification"]
      }
    ]
  };
})();
