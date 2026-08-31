<!-- Auto-drafted by the Volta Plant Floor agent. Source: app.work_orders_app.drafted_wo (work order 4952bea5-a0ba-4337-83d2-0030e8b87283, line LINE-0928) -->

**Volta Production Line: Preventive Maintenance Work Order**

**Line:** LINE-0928 (PLANT-08) | **Status:** Critical (Failure Risk 95%)
**Current Exposure:** $41,800 immediate downtime risk
**Part:** PART-00079 | Non-local stock | Lead time 6 days

**Why Now:** The line is in a critical state with a 95% failure risk and $41,800 in immediate downtime exposure. The maintenance model ranks pull_now as the highest-value action because the likely failing part, PART-00079, is not locally stocked and has a 6-day lead time. Delaying increases the chance of an unplanned stop and a longer recovery window.

**Recommendation:** Pull the line now. The model ranks pull_now above run_to_shift_end and expedite_parts_and_run on both downtime cost avoided and net value. Because the required part is non-local, expediting is not the preferred recovery path.

**Action Steps:**
1. Remove LINE-0928 from production immediately and isolate power per lockout/tagout procedure.
2. Inspect the assembly associated with PART-00079 for wear, heat, vibration damage, and any secondary component stress.
3. Replace the affected component if approved spares are available; otherwise stage the outage and escalate sourcing for PART-00079.
4. Inspect adjacent mounts, bearings, and couplings for collateral damage before restart.
5. Restart under controlled conditions and verify the line returns to stable operating condition before resuming normal production.

**Verification:**
- Confirm post-maintenance vibration and temperature stabilize versus pre-stop condition.
- Confirm no active alarms or immediate fault recurrence during controlled restart.
- Update maintenance records and monitor the line closely after return to service.

**Expected Impact:** Predicted downtime cost avoided: $83,600. This is the top-ranked maintenance action by the model.
