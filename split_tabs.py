
import re

with open("src/pages/StudentDashboard.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Identify the block for `activeTab === "dashboard"`
# It starts around:
# {activeTab === "dashboard" && (
#   <motion.div
#      key="dashboard"
#      ...
#      className="grid grid-cols-1 lg:grid-cols-3 gap-8"
#   >

dashboard_start_match = re.search(r"\{activeTab === \"dashboard\" && \(\s*<motion\.div.*?className=\"grid grid-cols-1 lg:grid-cols-3 gap-8\"\s*>", content, flags=re.DOTALL)
if not dashboard_start_match:
    print("Could not find dashboard start")
    exit(1)

# Now we need to find where this motion.div ends. It ends at `) : activeTab === "leaderboard" /* Dedicated Leaderboard Tab Layout */ ? (`
# Wait, I previously changed it to `)} {activeTab === "leaderboard" /* Dedicated Leaderboard Tab Layout */ && (` no, I havent.
# Let's find the leaderboard block.
leaderboard_match = re.search(r"(\s*)\) : activeTab === \"leaderboard\"", content)
if not leaderboard_match:
    # Maybe I replaced it already? No, I only wrapped the outside.
    print("Could not find leaderboard")
    exit(1)

dashboard_content_start = dashboard_start_match.end()
dashboard_content_end = leaderboard_match.start()

dashboard_inner = content[dashboard_content_start:dashboard_content_end]

# Now let's extract the specific sections from dashboard_inner using regex.

# Applications Section
apps_match = re.search(r"\{\/\* Recent Applications \*\/}.*?(?=\{\/\* Recommended Opportunities \*\/})", dashboard_inner, flags=re.DOTALL)
apps_section = apps_match.group(0) if apps_match else ""

# Recommendations Section
recs_match = re.search(r"\{\/\* Recommended Opportunities \*\/}.*?(?=<\/div>\s*\{\/\* Right Sidebar \*\/}|\{\/\* Sidebar \*\/})", dashboard_inner, flags=re.DOTALL)
if not recs_match:
    # Try finding the end of the div
    recs_match = re.search(r"\{\/\* Recommended Opportunities \*\/}.*?(?=<\/div>\s*<div className=\"space-y-8\">)", dashboard_inner, flags=re.DOTALL)
recs_section = recs_match.group(0) if recs_match else ""

# Hour Tracker Section
hours_match = re.search(r"\{\/\* Hour Tracker Gauge \*\/}.*?(?=\{\/\* Interest Matching \/ Waiting List in Sidebar \*\/})", dashboard_inner, flags=re.DOTALL)
hours_section = hours_match.group(0) if hours_match else ""

# Waitlist / Interest Section
waitlist_match = re.search(r"\{\/\* Interest Matching \/ Waiting List in Sidebar \*\/}.*?(?=<section>.*?Star className=\"text-amber)", dashboard_inner, flags=re.DOTALL)
waitlist_section = waitlist_match.group(0) if waitlist_match else ""

# Saved Section (the rest)
saved_match = re.search(r"<section>\s*<h2[^>]*>\s*<Star className=\"text-amber[^>]*>\s*Saved.*?<\/section>", dashboard_inner, flags=re.DOTALL)
saved_section = saved_match.group(0) if saved_match else ""

print("Parsed apps length:", len(apps_section))
print("Parsed recs length:", len(recs_section))
print("Parsed hours length:", len(hours_section))
print("Parsed waitlist length:", len(waitlist_section))
print("Parsed saved length:", len(saved_section))

# Create the new tab blocks!
# 1. Dashboard (Overview) -> Hour Gauge & Recommendations
tab_dashboard = f"""
        {{activeTab === "dashboard" && (
          <motion.div
            key="dashboard"
            initial={{{{ opacity: 0, y: 15 }}}}
            animate={{{{ opacity: 1, y: 0 }}}}
            exit={{{{ opacity: 0, y: -15 }}}}
            transition={{{{ duration: 0.25 }}}}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            <div>
              {{/* We need a smaller version of Hour Tracker here, but for now we put the whole thing or just Recommendations */}}
              {recs_section}
            </div>
            <div>
              {hours_section}
            </div>
          </motion.div>
        )}}
"""

# 2. Applications -> Recent Applications & Saved
tab_applications = f"""
        {{activeTab === "applications" && (
          <motion.div
            key="applications"
            initial={{{{ opacity: 0, y: 15 }}}}
            animate={{{{ opacity: 1, y: 0 }}}}
            exit={{{{ opacity: 0, y: -15 }}}}
            transition={{{{ duration: 0.25 }}}}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            <div className="lg:col-span-2">
              {apps_section}
            </div>
            <div>
              {saved_section}
            </div>
          </motion.div>
        )}}
"""

# 3. Hours -> Hour Tracker
tab_hours = f"""
        {{activeTab === "hours" && (
          <motion.div
            key="hours"
            initial={{{{ opacity: 0, y: 15 }}}}
            animate={{{{ opacity: 1, y: 0 }}}}
            exit={{{{ opacity: 0, y: -15 }}}}
            transition={{{{ duration: 0.25 }}}}
            className="max-w-3xl mx-auto"
          >
            {hours_section}
          </motion.div>
        )}}
"""

# Settings -> Waitlist and the existing settings block
# Existing settings block is later in the file.
# We will just replace the existing `activeTab === "dashboard"` block with these 3 new tabs.
# Then later we will move the waitlist to settings.

new_dashboard_block = tab_dashboard + tab_applications + tab_hours

# Wait, `) : activeTab === "leaderboard" ? (` was already changed to `)} {activeTab === "leaderboard" && (` when I replaced the AnimatePresence? No, I only changed the outside!
# Ah, I didn't change `) : activeTab === ` to `)} {activeTab === `. Let's do that here too.

# Replace the whole block from `{activeTab === "dashboard" ? (` to `) : activeTab === "leaderboard" /* Dedicated Leaderboard Tab Layout */ ? (`

content = content.replace(content[dashboard_start_match.start() : dashboard_content_end], new_dashboard_block)

# Also fix the `) : activeTab === ` for leaderboard and settings
content = content.replace(") : activeTab === \"leaderboard\" /* Dedicated Leaderboard Tab Layout */ ? (", "{activeTab === \"leaderboard\" && (")
content = content.replace(") : activeTab === \"settings\" ? (", ")} {activeTab === \"settings\" && (")

# And we need to inject the waitlist section into the settings tab!
settings_match = re.search(r"\{activeTab === \"settings\" && \(\s*<motion\.div.*?className=\"max-w-3xl mx-auto space-y-8\"\s*>", content, flags=re.DOTALL)
if settings_match:
    # Inject waitlist section at the top of settings
    insertion_point = settings_match.end()
    content = content[:insertion_point] + "\n" + waitlist_section + "\n" + content[insertion_point:]

with open("src/pages/StudentDashboard.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Done writing")

