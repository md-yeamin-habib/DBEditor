# Valid Prompts & Text Commands Guide

This document lists supported natural language prompts for the AI Assistant, categorized by database domain and functionality.

---

## 1. Global / General Data Manipulation & Cleaning

### Totals & Sum Aggregations (Row-wise)
- "Calculate total of math, science, and english"
- "Sum of marks, physics, chemistry as Total_Score"
- "Add total column for physics and chemistry"
- "Replace with total score"

### Averages & Aggregations (Row-wise)
- "Calculate average of math, science, and english"
- "Top 3 score average and call it Final_Grade"
- "Replace with average score"

### Numerical Cleaning & Transformations
- "Round off decimal values"
- "Round numbers in marks column"
- "Remove error margin from values"
- "Truncate margin of error" *(e.g., cleans patterns like `1045.67 ± 1.45` to `1045.67`)*

### Cell Edits & Missing Values
- "Change 5.50 to 6.00"
- "Replace empty cells with 'Unassigned'"
- "Fill null values with N/A"
- "Audit missing data" / "Check missing values"

### Duplicate Detection & Removal
- "Find duplicate rows"
- "Remove duplicate rows" / "Delete duplicate students"

### Rankings
- "Add rank based on price"
- "Rank students by total score"

---

## 2. Shopping List Database (`shopping_list`)

### Total Cost & Column Sums
- "What is the total cost?"
- "Calculate the total price of all items bought."
- "Show me the sum of all price values."

### Rankings & Cleaning
- "Add rank based on price"
- "Change 5.50 to 6.00"
- "Find duplicate rows in shopping list"

---

## 3. Student Database (`student_database`)
*(Applies to `marks`, `career_preferences`, and `personal_details` tables)*

### Subject Score Aggregations & Averages
- "Calculate total of physics, chemistry, biology"
- "Calculate average of math, science, and english"
- "Top 3 score average and call it Final_Grade"

### Rankings
- "Add rank column based on marks"
- "Rank students by total score"

### Cross-Table Joins & Student Profiles
- "Show student profile details"
- "Get career aspiration, marks and phone for John"
- "Generate student details report"

### Auditing & Cleaning
- "Audit missing data"
- "Fill missing marks with 0"
- "Delete duplicate students"

---

## 4. Sports Day Database (`SportsDay`)
*(Applies to `relay`, `threelegged`, `solo`, and event tables)*

### Leaderboards & Standings
- "Show sports standings"
- "Display sports department points"
- "Generate leaderboard for department points"
- "Which department has the most 1st place wins?"

### Auditing & Cleaning
- "Check missing values in standings"
- "Find duplicates in sports results"
- "Remove duplicate entries from sports table"

---

## Pattern Guidelines for Best Results

1. **Cell Edits:** Use the explicit pattern `change [old_value] to [new_value]` or `replace [old_value] with [new_value]`.
2. **Filling Missing Data:** Include keywords like `fill missing`, `fill null`, or `replace empty` combined with `with [value]`.
3. **Subject Totals & Averages:** Name specific columns (e.g., `"total of physics, chemistry"`) or specify top count (e.g., `"top 3"`).
4. **Staged Confirmation & Esc Key:** All structural changes (adding totals/averages, rounding, truncating error margins, editing values, removing duplicates) generate a staged preview in **Green** (additions) or **Red** (deletions). Press **Esc** to cancel an active staged action at any time without applying changes to the database.
5. **View Refreshing:** When an action is confirmed, click or reopen the active table tab to refresh and display the updated database contents cleanly.
