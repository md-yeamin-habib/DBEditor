# Valid Prompts & Voice/Text Commands Guide

This document lists supported natural language prompts for the AI Assistant, categorized by database domain and functionality.

---

## 1. Shopping List Database (`shopping_list`)

### Total Cost & Sums
* "What is the total cost?"
* "Calculate the total price of all items bought."
* "Show me the sum of all price values."

### Rankings
* "Add rank based on price."
* "Rank items by cost."

### Cell Edits & Data Cleaning
* "Change 5.50 to 6.00"
* "Replace empty cells with 'Unassigned'"
* "Fill null values with N/A"

### Duplicate Detection
* "Find duplicate rows in shopping list"
* "Remove duplicates"

---

## 2. Student Database (`student_database`)
*(Applies to `marks`, `career_preferences`, and `personal_details` tables)*

### Averages & Subject Score Aggregations
* "Calculate average of math, science, and english"
* "Top 3 score average and call it Final_Grade"
* "Replace with average score"

### Rankings
* "Add rank column based on marks"
* "Rank students by total score"

### Cross-Table Joins & Student Profiles
* "Show student profile details"
* "Get career aspiration, marks and phone for John"
* "Generate student details report"

### Auditing & Cleaning
* "Audit missing data"
* "Fill missing marks with 0"
* "Delete duplicate students"

---

## 3. Sports Day Database (`SportsDay`)
*(Applies to `relay`, `threelegged`, `solo`, and event tables)*

### Leaderboards & Standings
* "Show sports standings"
* "Display sports department points"
* "Generate leaderboard for department points"
* "Which department has the most 1st place wins?"

### Auditing & Cleaning
* "Check missing values in standings"
* "Find duplicates in sports results"
* "Remove duplicate entries from sports table"

---

## Pattern Guidelines for Best Results

1. **Cell Edits:** Use the explicit pattern `change [old_value] to [new_value]` or `replace [old_value] with [new_value]`.
2. **Filling Missing Data:** Include keywords like `fill missing`, `fill null`, or `replace empty` combined with `with [value]`.
3. **Subject Averages:** Name specific columns (e.g., `"average of physics, chemistry"`) or specify top count (e.g., `"top 3"`).
