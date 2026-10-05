import sqlite3
import re
import statistics
from contextlib import contextmanager

class AIService:
    def __init__(self, db_path="session_cache/working_session.db"):
        self.db_path = db_path

    @contextmanager
    def _db_connection(self):
        """Context manager to streamline database connection and cursor lifecycle."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            yield conn, cursor
        finally:
            conn.close()

    # --- HELPER UTILITIES ---

    def _get_table_columns(self, cursor, table_name: str) -> list:
        """Retrieves column names for a given table."""
        cursor.execute(f'PRAGMA table_info("{table_name}");')
        return [info[1] for info in cursor.fetchall()]

    def _get_user_columns_for_duplicates(self, cursor, table_name: str) -> list:
        """Returns user content columns, excluding primary keys and internal rowid aliases."""
        cursor.execute(f'PRAGMA table_info("{table_name}");')
        user_cols = []
        for col in cursor.fetchall():
            col_name, is_pk = col[1], col[5] == 1
            if col_name.lower() in ("_row_id", "_rowid_", "rowid", "oid", "id") or is_pk:
                continue
            user_cols.append(col_name)
        return user_cols

    def _clean_numeric_val(self, val):
        """Parses a value into integer, float, or raw string."""
        if val is None:
            return None
        str_val = str(val).strip()
        clean_str = re.sub(r'[^\d.-]', '', str_val)
        if clean_str:
            try:
                float_val = float(clean_str)
                return int(float_val) if float_val.is_integer() else float_val
            except ValueError:
                pass
        return str_val

    def _sql_clean_numeric_expr(self, col_name: str) -> str:
        """Returns SQLite expression to sanitize currency and standard formatted strings into numbers."""
        return f'COALESCE(CAST(REPLACE(REPLACE("{col_name}", "$", ""), ",", "") AS REAL), 0)'

    def _extract_subject_cols(self, query_lower: str, existing_cols: list) -> list:
        """Extracts candidate numeric/subject columns based on explicit names or 'top N' filters."""
        matched_cols = [c for c in existing_cols if c.lower() in query_lower and c.lower() not in ["rank", "id", "roll"]]
        if matched_cols:
            return matched_cols

        top_n_match = re.search(r'top\s+(\d+)', query_lower)
        keywords = ["marks", "mathematics", "english", "physics", "chemistry", "biology", "history", "geography", "score"]
        numeric_cols = [c for c in existing_cols if any(k in c.lower() for k in keywords)]

        if top_n_match:
            n = int(top_n_match.group(1))
            return numeric_cols[:n] if numeric_cols else existing_cols[:n]

        return numeric_cols

    # --- PUBLIC STATISTICAL APIS ---

    def _calc_col_stat(self, table_name: str, col_name: str, stat_func) -> dict:
        """Unified internal engine for column mean and median statistical calculations."""
        with self._db_connection() as (_, cursor):
            all_cols = self._get_table_columns(cursor, table_name)
            target_cols = [col_name] if (col_name and col_name != "ALL_COLUMNS") else all_cols
            results = {}

            for col in target_cols:
                cursor.execute(f'SELECT "{col}" FROM "{table_name}" WHERE "{col}" IS NOT NULL AND TRIM(CAST("{col}" AS TEXT)) != "";')
                numeric_vals = []
                for row in cursor.fetchall():
                    val = self._clean_numeric_val(row[0])
                    if isinstance(val, (int, float)):
                        numeric_vals.append(val)

                if numeric_vals:
                    results[col] = round(stat_func(numeric_vals), 2)

            if col_name and col_name != "ALL_COLUMNS":
                return results.get(col_name, 0.0)
            return results

    def mean_of_col(self, table_name: str, col_name: str = None) -> dict:
        return self._calc_col_stat(table_name, col_name, statistics.mean)

    def median_of_col(self, table_name: str, col_name: str = None) -> dict:
        return self._calc_col_stat(table_name, col_name, statistics.median)

    # --- MAIN QUERY ROUTER ---

    def process_query(self, query_text: str, active_table: str = "Table1") -> dict:
        query_lower = query_text.lower()

        if any(kw in query_lower for kw in ["round off", "round values", "round integers", "round column", "round"]):
            return self._stage_round_values(active_table, query_text)
        elif any(kw in query_lower for kw in ["truncate", "error margin", "margin of error", "remove error", "strip margin", "+-", "±"]):
            return self._stage_truncate_margin_of_error(active_table, query_text)
        elif any(kw in query_lower for kw in ["average of", "avg of", "top", "merge columns", "replace with average"]):
            return self._handle_subject_aggregation(active_table, query_text, mode="AVG")
        elif any(kw in query_lower for kw in ["total of", "sum of", "total score", "add total", "replace with total"]):
            return self._handle_subject_aggregation(active_table, query_text, mode="SUM")
        elif any(kw in query_lower for kw in ["change", "update", "replace value", "set"]):
            return self._stage_cell_value_change(active_table, query_text)
        elif "duplicate" in query_lower or "duplicates" in query_lower:
            if any(kw in query_lower for kw in ["delete", "remove", "drop", "clear"]):
                return self._stage_remove_duplicates(active_table)
            else:
                return self._find_duplicates(active_table)
        elif any(kw in query_lower for kw in ["fill missing", "fill null", "replace empty", "fill empty"]):
            return self._stage_fill_missing_values(active_table, query_text)
        elif any(kw in query_lower for kw in ["sports", "standings", "leaderboard", "department points", "most 1st"]):
            return self._sports_department_standings()
        elif any(kw in query_lower for kw in ["student profile", "career aspiration", "marks and phone", "student details"]):
            return self._generate_student_profile(query_text)
        elif any(kw in query_lower for kw in ["total cost", "sum", "total price", "bought", "bill"]):
            return self._calculate_sum(active_table)
        elif any(kw in query_lower for kw in ["add rank", "rank column", "rank", "rank students"]):
            return self._stage_rank_column(active_table, query_text)
        elif any(kw in query_lower for kw in ["missing", "null", "empty", "audit"]):
            return self._check_missing_values(active_table)
        else:
            return {
                "message": f"I analyzed your query: '{query_text}'. No direct action was matched.",
                "actions": []
            }

    # --- CONFIRMATION HANDLER ---

    def confirm_action(self, action_payload: dict) -> dict:
        action_type = action_payload.get("action_type")
        table_name = action_payload.get("table_name")

        with self._db_connection() as (conn, cursor):
            try:
                if action_type == "ROUND_COLUMN":
                    target_col = action_payload.get("column")
                    self._execute_round_column(cursor, table_name, target_col)
                    msg = f"Successfully rounded all numeric values in `{target_col}` for `{table_name}`."

                elif action_type == "TRUNCATE_ERROR_MARGIN":
                    diffs = action_payload.get("diffs", [])
                    self._execute_truncate_error_margin(cursor, table_name, diffs)
                    msg = f"Successfully removed margins of error from values in `{table_name}`."

                elif action_type == "REMOVE_DUPLICATES":
                    user_cols = self._get_user_columns_for_duplicates(cursor, table_name)
                    if not user_cols:
                        return {"message": "No data columns found to remove duplicates.", "actions": []}

                    group_exprs = [f'TRIM(CAST("{c}" AS TEXT))' for c in user_cols]
                    group_str = ", ".join(group_exprs)

                    delete_sql = f"""
                        DELETE FROM "{table_name}"
                        WHERE _rowid_ NOT IN (
                            SELECT MIN(_rowid_) FROM "{table_name}" GROUP BY {group_str}
                        );
                    """
                    cursor.execute(delete_sql)
                    msg = f"Successfully removed duplicate rows from `{table_name}`."

                elif action_type == "UPDATE_CELL_VALUE":
                    column = action_payload.get("column")
                    old_val = action_payload.get("old_value")
                    new_val = action_payload.get("new_value")
                    
                    parsed_old = self._clean_numeric_val(old_val)
                    parsed_new = self._clean_numeric_val(new_val)

                    if column:
                        # Update specific column
                        cursor.execute(
                            f'UPDATE "{table_name}" SET "{column}" = ? WHERE "{column}" = ? OR CAST("{column}" AS TEXT) = ?;',
                            (parsed_new, parsed_old, str(old_val))
                        )
                    else:
                        # Update across all columns
                        columns = self._get_table_columns(cursor, table_name)
                        for col in columns:
                            cursor.execute(
                                f'UPDATE "{table_name}" SET "{col}" = ? WHERE "{col}" = ? OR CAST("{col}" AS TEXT) = ?;',
                                (new_val, old_val, old_val)
                        )
                    msg = f"Updated values from `{old_val}` to `{new_val}` in `{column if column else "all columns"}` in `{table_name}`."


                elif action_type in ("ADD_TOTAL_COLUMN", "ADD_AVERAGE_COLUMN"):
                    new_col = action_payload.get("new_col")
                    source_cols = action_payload.get("source_cols")
                    drop_originals = action_payload.get("drop_originals", False)

                    existing_cols = self._get_table_columns(cursor, table_name)
                    if new_col not in existing_cols:
                        cursor.execute(f'ALTER TABLE "{table_name}" ADD COLUMN "{new_col}" REAL;')

                    sum_parts = [self._sql_clean_numeric_expr(c) for c in source_cols]
                    sum_expression = " + ".join(sum_parts)
                    expr = sum_expression if action_type == "ADD_TOTAL_COLUMN" else f"({sum_expression}) / {len(source_cols)}"

                    cursor.execute(f'UPDATE "{table_name}" SET "{new_col}" = ROUND(({expr}), 2);')

                    if drop_originals:
                        for c in source_cols:
                            try:
                                cursor.execute(f'ALTER TABLE "{table_name}" DROP COLUMN "{c}";')
                            except sqlite3.OperationalError:
                                pass

                    calc_label = "totals" if action_type == "ADD_TOTAL_COLUMN" else "averages"
                    msg = f"Successfully created column `{new_col}` with {calc_label} from {source_cols}."

                elif action_type == "FILL_MISSING":
                    target_col = action_payload.get("column")
                    fill_value = action_payload.get("fill_value")
                    fill_map = action_payload.get("fill_map")

                    if fill_map:
                        for col, val in fill_map.items():
                            cursor.execute(
                                f'UPDATE "{table_name}" SET "{col}" = ? WHERE "{col}" IS NULL OR "{col}" = "" OR TRIM(CAST("{col}" AS TEXT)) = "";',
                                (val,)
                            )
                        msg = f"Filled missing entries in `{table_name}` using per-column calculated medians/means."
                    elif target_col and target_col != "ALL_COLUMNS":
                        cursor.execute(
                            f'UPDATE "{table_name}" SET "{target_col}" = ? WHERE "{target_col}" IS NULL OR "{target_col}" = "" OR TRIM(CAST("{target_col}" AS TEXT)) = "";',
                            (fill_value,)
                        )
                        msg = f"Filled missing entries in column `{target_col}` of `{table_name}` with `{fill_value}`."
                    else:
                        for col in self._get_table_columns(cursor, table_name):
                            cursor.execute(
                                f'UPDATE "{table_name}" SET "{col}" = ? WHERE "{col}" IS NULL OR "{col}" = "" OR TRIM(CAST("{col}" AS TEXT)) = "";',
                                (fill_value,)
                            )
                        msg = f"Filled missing entries in `{table_name}` with `{fill_value}`."

                elif action_type == "ADD_RANK":
                    target_col = action_payload.get("target_col")
                    if "Rank" not in self._get_table_columns(cursor, table_name):
                        cursor.execute(f'ALTER TABLE "{table_name}" ADD COLUMN Rank INTEGER;')

                    clean_col = self._sql_clean_numeric_expr(target_col)
                    rank_update_sql = f"""
                        WITH Ranked AS (
                            SELECT _rowid_ as rid, DENSE_RANK() OVER (ORDER BY {clean_col} DESC) as computed_rank
                            FROM "{table_name}"
                        )
                        UPDATE "{table_name}"
                        SET Rank = (SELECT computed_rank FROM Ranked WHERE Ranked.rid = "{table_name}"._rowid_);
                    """
                    cursor.execute(rank_update_sql)
                    msg = f"Rankings updated successfully in `{table_name}` based on `{target_col}`."

                else:
                    return {"message": "Unknown action type.", "actions": []}

                conn.commit()
                return {
                    "message": msg,
                    "actions": [{"type": "REFRESH_TABLE", "table_name": table_name}]
                }

            except Exception as e:
                conn.rollback()
                return {"message": f"Error applying action: {str(e)}", "actions": []}

    # --- FEATURE STAGING & UTILITY METHODS ---

    def _handle_subject_aggregation(self, table_name: str, query_text: str, mode: str = "SUM") -> dict:
        """Unified handler for subject totals and averages staging."""
        with self._db_connection() as (_, cursor):
            existing_cols = self._get_table_columns(cursor, table_name)
            query_lower = query_text.lower()
            drop_originals = any(k in query_lower for k in ["replace", "drop", "instead of", "remove originals"])

            default_col = "Total_Score" if mode == "SUM" else "Average_Score"
            new_col_match = re.search(r'(?:add|call it|name it|as)\s+([a-zA-Z0-9_]+)', query_lower)
            new_col = new_col_match.group(1).title() if new_col_match else default_col

            source_cols = self._extract_subject_cols(query_lower, existing_cols)
            if not source_cols:
                action_word = "sum" if mode == "SUM" else "average"
                return {"message": f"Could not determine valid subject columns to {action_word} in `{table_name}`.", "actions": []}

            sum_parts = [self._sql_clean_numeric_expr(c) for c in source_cols]
            sum_expression = " + ".join(sum_parts)
            calc_expr = sum_expression if mode == "SUM" else f"({sum_expression}) / {len(source_cols)}"

            cursor.execute(f'SELECT ROUND(({calc_expr}), 2) FROM "{table_name}" ORDER BY _rowid_;')
            computed_vals = [row[0] for row in cursor.fetchall()]

            action_type = "ADD_TOTAL_COLUMN" if mode == "SUM" else "ADD_AVERAGE_COLUMN"
            staged_payload = {
                "action_type": action_type,
                "table_name": table_name,
                "new_col": new_col,
                "source_cols": source_cols,
                "drop_originals": drop_originals
            }

            label = "total sum" if mode == "SUM" else "average"
            msg = (
                f"**Proposed Table Action:**\n"
                f"- Calculate {label} of columns: `{', '.join(source_cols)}`\n"
                f"- New Column: **`{new_col}`** (Highlighted in **Green**)\n"
            )
            if drop_originals:
                msg += f"- Columns to Drop: `{', '.join(source_cols)}` (Highlighted in **Red**)\n"
            msg += "\nDo you want to accept these changes?"

            return {
                "message": msg,
                "actions": [{
                    "type": "STAGED_CONFIRMATION",
                    "payload": staged_payload,
                    "highlights": {
                        "added_columns": [new_col],
                        "added_column_values": {new_col: computed_vals},
                        "removed_columns": source_cols if drop_originals else []
                    }
                }]
            }

    def _find_duplicates(self, table_name: str) -> dict:
        with self._db_connection() as (_, cursor):
            user_cols = self._get_user_columns_for_duplicates(cursor, table_name)
            if not user_cols:
                return {"message": f"No content columns available to evaluate duplicates in `{table_name}`.", "actions": []}

            group_str = ", ".join([f'TRIM(CAST("{c}" AS TEXT))' for c in user_cols])
            query = f'SELECT MIN(_rowid_), COUNT(*) FROM "{table_name}" GROUP BY {group_str} HAVING COUNT(*) > 1;'
            cursor.execute(query)
            duplicate_groups = cursor.fetchall()

            if duplicate_groups:
                dup_rowids_query = f'SELECT _rowid_ FROM "{table_name}" WHERE _rowid_ NOT IN (SELECT MIN(_rowid_) FROM "{table_name}" GROUP BY {group_str});'
                cursor.execute(dup_rowids_query)
                dup_rowids = [r[0] for r in cursor.fetchall()]

                return {
                    "message": f"Found **{len(dup_rowids)} duplicate record(s)** across **{len(duplicate_groups)} group(s)** in `{table_name}`.",
                    "actions": [{"type": "HIGHLIGHT_DUPLICATES", "rowids": dup_rowids}]
                }
            return {"message": f"No duplicate records found in `{table_name}`.", "actions": []}

    def _stage_remove_duplicates(self, table_name: str) -> dict:
        with self._db_connection() as (_, cursor):
            user_cols = self._get_user_columns_for_duplicates(cursor, table_name)
            if not user_cols:
                return {"message": f"No content columns available in `{table_name}`.", "actions": []}

            group_str = ", ".join([f'TRIM(CAST("{c}" AS TEXT))' for c in user_cols])
            cursor.execute(f'SELECT _rowid_ FROM "{table_name}" WHERE _rowid_ NOT IN (SELECT MIN(_rowid_) FROM "{table_name}" GROUP BY {group_str});')
            duplicate_ids = [r[0] for r in cursor.fetchall()]

            if not duplicate_ids:
                return {"message": f"No duplicate rows exist in `{table_name}` to remove.", "actions": []}

            return {
                "message": (
                    f"**Proposed Action:** Remove **{len(duplicate_ids)} duplicate row(s)** from `{table_name}`.\n"
                    f"Duplicate rows scheduled for removal are highlighted in **Red**.\n\nAccept or Cancel changes?"
                ),
                "actions": [{
                    "type": "STAGED_CONFIRMATION",
                    "payload": {"action_type": "REMOVE_DUPLICATES", "table_name": table_name},
                    "highlights": {"removed_rowids": duplicate_ids}
                }]
            }

    def _stage_rank_column(self, table_name: str, query_text: str) -> dict:
        with self._db_connection() as (_, cursor):
            columns = self._get_table_columns(cursor, table_name)
            target_col = next((c for c in columns if c.lower() in query_text.lower() and c.lower() not in ["rank", "id"]), None)
            if not target_col:
                target_col = next((c for c in columns if c.lower() in ["total_score", "final_score", "total", "marks", "score"]), columns[0])

            clean_col = self._sql_clean_numeric_expr(target_col)
            rank_query = f'''
                WITH Ranked AS (
                    SELECT _rowid_ as rid, DENSE_RANK() OVER (ORDER BY {clean_col} DESC) as computed_rank
                    FROM "{table_name}"
                )
                SELECT computed_rank FROM "{table_name}"
                JOIN Ranked ON "{table_name}"._rowid_ = Ranked.rid
                ORDER BY "{table_name}"._rowid_;
            '''
            cursor.execute(rank_query)
            computed_ranks = [row[0] for row in cursor.fetchall()]

            return {
                "message": (
                    f"**Proposed Table Action:** Add **Rank** column calculated from **`{target_col}`**.\n"
                    f"New column will be highlighted in **Green**.\n\nAccept or Cancel modifications?"
                ),
                "actions": [{
                    "type": "STAGED_CONFIRMATION",
                    "payload": {"action_type": "ADD_RANK", "table_name": table_name, "target_col": target_col},
                    "highlights": {
                        "added_columns": ["Rank"],
                        "added_column_values": {"Rank": computed_ranks}
                    }
                }]
            }

    def _stage_cell_value_change(self, table_name: str, query_text: str) -> dict:
        match = re.search(r'(?:change|replace|set)\s+(?:.*?\s+)?([0-9]+(?:\.[0-9]+)?|\w+)\s+(?:to|with|->)\s+([0-9]+(?:\.[0-9]+)?|\w+)', query_text, re.IGNORECASE)

        if not match:
            numbers = re.findall(r'[-+]?\d*\.\d+|\d+', query_text)
            if len(numbers) >= 2:
                old_val, new_val = numbers[0], numbers[1]
            else:
                return {"message": "Please specify the change in the format: 'change [old_value] to [new_value]'.", "actions": []}
        else:
            old_val, new_val = match.group(1).strip("'\" "), match.group(2).strip("'\" ")

        with self._db_connection() as (_, cursor):
            columns = self._get_table_columns(cursor, table_name)
            query_lower = query_text.lower()
            
            # Check ONLY if a column name was explicitly mentioned in the user query text
            target_col = next((c for c in columns if c.lower() in query_lower), None)

            return {
                "message": (
                    f"**Proposed Cell Edit in `{table_name}`:**\n"
                    f"- Column: `{target_col or 'All Columns'}`\n"
                    f"- Change: `[{old_val}]` -> `[{new_val}]`\n\nConfirm to apply this update."
                ),
                "actions": [{
                    "type": "STAGED_CONFIRMATION",
                    "payload": {
                        "action_type": "UPDATE_CELL_VALUE",
                        "table_name": table_name,
                        "column": target_col, # None when generic, column_name when explicitly specified
                        "old_value": old_val,
                        "new_value": new_val
                    },
                    "highlights": {
                        "cell_diffs": [{"column": target_col, "old_val": old_val, "new_val": new_val}]
                    }
                }]
            }

    def _stage_fill_missing_values(self, table_name: str, query_text: str) -> dict:
        with self._db_connection() as (_, cursor):
            columns = self._get_table_columns(cursor, table_name)
            query_lower = query_text.lower()
            query_words = set(re.findall(r'\b\w+\b', query_lower))

            reserved_words = {
                "fill", "missing", "null", "empty", "values", "value",
                "with", "to", "as", "median", "mean", "average", "in",
                "the", "table", "for", "all", "columns", "column"
            }

            target_col = next((c for c in columns if c.lower() not in reserved_words and c.lower() in query_words), None)
            fill_value, fill_map = None, None

            if "median" in query_lower:
                fill_value = self.median_of_col(table_name, target_col) if target_col else None
                fill_map = None if target_col else self.median_of_col(table_name, "ALL_COLUMNS")
            elif "mean" in query_lower or "average" in query_lower:
                fill_value = self.mean_of_col(table_name, target_col) if target_col else None
                fill_map = None if target_col else self.mean_of_col(table_name, "ALL_COLUMNS")
            else:
                fill_val_match = re.search(r'(?:with|to|as)\s+[\'"]?([^\'"]+)[\'"]?', query_text, re.IGNORECASE)
                if fill_val_match:
                    fill_value = self._clean_numeric_val(fill_val_match.group(1).strip())
                else:
                    fill_value = "N/A"

            if target_col:
                cursor.execute(f'SELECT COUNT(*) FROM "{table_name}" WHERE "{target_col}" IS NULL OR "{target_col}" = "" OR TRIM(CAST("{target_col}" AS TEXT)) = "";')
                missing_count = cursor.fetchone()[0]
            else:
                missing_count = sum(
                    cursor.execute(f'SELECT COUNT(*) FROM "{table_name}" WHERE "{col}" IS NULL OR "{col}" = "" OR TRIM(CAST("{col}" AS TEXT)) = "";').fetchone()[0]
                    for col in columns
                )
                target_col = "ALL_COLUMNS"

            if missing_count == 0:
                return {"message": f"No missing cells found in table `{table_name}`.", "actions": []}

            if fill_map:
                map_str = "\n".join([f"- `{col}`: **{val}**" for col, val in fill_map.items()])
                msg = f"**Proposed Data Cleaning Action:**\nReplace **{missing_count}** empty cell(s) across all columns in `{table_name}` using individual column medians/means:\n{map_str}\n\nConfirm execution?"
            else:
                col_display = f"Column: `{target_col}`" if target_col != "ALL_COLUMNS" else "All Columns"
                msg = f"**Proposed Data Cleaning Action:**\n- Replace **{missing_count}** empty cell(s) in `{table_name}` ({col_display}) with **`{fill_value}`**.\n\nConfirm execution?"

            return {
                "message": msg,
                "actions": [{
                    "type": "STAGED_CONFIRMATION",
                    "payload": {
                        "action_type": "FILL_MISSING",
                        "table_name": table_name,
                        "column": target_col,
                        "fill_value": fill_value,
                        "fill_map": fill_map
                    },
                    "highlights": {
                        "fill_preview": {
                            "column": target_col,
                            "fill_value": fill_value if fill_value is not None else fill_map,
                            "fill_map": fill_map
                        }
                    }
                }]
            }

    def _sports_department_standings(self) -> dict:
        with self._db_connection() as (conn, cursor):
            try:
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
                sports_tables = [t for t in [r[0] for r in cursor.fetchall()] if any(k in t.lower() for k in ["relay", "threelegged", "solo", "sport"])]

                if not sports_tables:
                    return {"message": "No sports tables found in active session database.", "actions": []}

                unions = [f'SELECT department_name, position FROM "{t}" WHERE position IS NOT NULL AND position != ""' for t in sports_tables]
                target_table_name = "Sports_Leaderboard"

                cursor.execute(f'DROP TABLE IF EXISTS "{target_table_name}";')
                cursor.execute(f"""
                    CREATE TABLE "{target_table_name}" AS
                    WITH CombinedSports AS ({' UNION ALL '.join(unions)})
                    SELECT 
                        department_name AS "Department", 
                        COUNT(CASE WHEN position IN ('1', '1st', 'First') THEN 1 END) AS "1st_Place",
                        COUNT(CASE WHEN position IN ('2', '2nd', 'Second') THEN 1 END) AS "2nd_Place",
                        COUNT(CASE WHEN position IN ('3', '3rd', 'Third') THEN 1 END) AS "3rd_Place"
                    FROM CombinedSports
                    GROUP BY department_name
                    ORDER BY "1st_Place" DESC, "2nd_Place" DESC;
                """)
                conn.commit()

                return {
                    "message": f"Generated new query view table **`{target_table_name}`** in database.",
                    "actions": [
                        {"type": "REFRESH_TABLE_LIST"},
                        {"type": "SWITCH_TABLE", "table_name": target_table_name}
                    ]
                }
            except Exception as e:
                conn.rollback()
                return {"message": f"Sports analytics query failed: {str(e)}", "actions": []}

    def _generate_student_profile(self, query_text: str) -> dict:
        with self._db_connection() as (conn, cursor):
            try:
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
                existing_tables = [r[0].lower() for r in cursor.fetchall()]

                required_tables = ["marks", "career_preferences", "personal_details"]
                if not all(t in existing_tables for t in required_tables):
                    return {"message": "Student profile view requires tables: `marks`, `career_preferences`, and `personal_details`.", "actions": []}

                words = [w for w in query_text.split() if len(w) > 3 and w.lower() not in ["student", "details", "profile", "show", "marks"]]
                target_name = words[0] if words else None
                target_table_name = "Student_Profiles"

                cursor.execute(f'DROP TABLE IF EXISTS "{target_table_name}";')

                base_sql = """
                    CREATE TABLE "{target_table_name}" AS
                    SELECT 
                        m.student_name AS "Student Name", 
                        m.total AS "Total Marks", 
                        c.career_aspiration AS "Career Aspiration", 
                        p.phone_number AS "Phone Number"
                    FROM marks m
                    LEFT JOIN career_preferences c ON LOWER(m.student_name) = LOWER(c.student_name)
                    LEFT JOIN personal_details p ON LOWER(m.student_name) = LOWER(p.student_name)
                """.replace("{target_table_name}", target_table_name)

                if target_name:
                    cursor.execute(f"{base_sql} WHERE LOWER(m.student_name) LIKE ?;", (f"%{target_name.lower()}%",))
                else:
                    cursor.execute(f"{base_sql};")

                conn.commit()

                return {
                    "message": f"Created merged view table **`{target_table_name}`**.",
                    "actions": [
                        {"type": "REFRESH_TABLE_LIST"},
                        {"type": "SWITCH_TABLE", "table_name": target_table_name}
                    ]
                }
            except Exception as e:
                conn.rollback()
                return {"message": f"Cross-table join failed: {str(e)}", "actions": []}

    def _calculate_sum(self, table_name: str) -> dict:
        with self._db_connection() as (_, cursor):
            columns = self._get_table_columns(cursor, table_name)
            target_col = next((c for c in columns if any(k in c.lower() for k in ["price", "cost", "amount", "value", "total"])), None)

            if not target_col:
                return {"message": f"No numeric price/cost column found in `{table_name}`.", "actions": []}

            clean_col = self._sql_clean_numeric_expr(target_col)
            bought_col = next((c for c in columns if c.lower() in ["bought", "status", "purchased"]), None)

            if bought_col:
                cursor.execute(f'SELECT SUM({clean_col}) FROM "{table_name}" WHERE LOWER("{bought_col}") in (\'yes\', \'y\', \'true\', \'1\');')
                msg = f"Total sum of **{target_col}** for bought items in `{table_name}`: **${cursor.fetchone()[0] or 0.0:.2f}**"
            else:
                cursor.execute(f'SELECT SUM({clean_col}) FROM "{table_name}";')
                msg = f"Total sum of **{target_col}** in `{table_name}`: **${cursor.fetchone()[0] or 0.0:.2f}**"

            return {"message": msg, "actions": []}

    def _check_missing_values(self, table_name: str) -> dict:
        with self._db_connection() as (_, cursor):
            columns = self._get_table_columns(cursor, table_name)
            total_missing = sum(
                cursor.execute(f'SELECT COUNT(*) FROM "{table_name}" WHERE "{col}" IS NULL OR "{col}" = "" OR TRIM(CAST("{col}" AS TEXT)) = "";').fetchone()[0]
                for col in columns
            )
            return {
                "message": f"Audit for `{table_name}`: Found **{total_missing}** missing/empty cells.",
                "actions": [{"type": "HIGHLIGHT_MISSING"}]
            }

    def _stage_round_values(self, table_name: str, query_text: str) -> dict:
        with self._db_connection() as (_, cursor):
            columns = self._get_table_columns(cursor, table_name)
            target_col = next((c for c in columns if c.lower() in query_text.lower() and c.lower() not in ["id", "rowid"]), None)

            if not target_col:
                for c in columns:
                    cursor.execute(f'SELECT "{c}" FROM "{table_name}" WHERE "{c}" IS NOT NULL AND TRIM(CAST("{c}" AS TEXT)) != "" LIMIT 10;')
                    vals = [r[0] for r in cursor.fetchall()]
                    if any(isinstance(v, float) or (isinstance(v, str) and "." in v and v.replace(".", "", 1).isdigit()) for v in vals):
                        target_col = c
                        break

            if not target_col:
                return {"message": f"Could not find a numeric column to round off in `{table_name}`.", "actions": []}

            cursor.execute(f'SELECT _rowid_, "{target_col}" FROM "{table_name}" WHERE "{target_col}" IS NOT NULL;')
            diffs = []
            for rowid, val in cursor.fetchall():
                clean_val = self._clean_numeric_val(val)
                if isinstance(clean_val, float) and not clean_val.is_integer():
                    rounded_val = int(round(clean_val))
                    diffs.append({
                        "column": target_col,
                        "old_val": str(val).strip(),
                        "new_val": str(rounded_val)
                    })

            if not diffs:
                return {"message": f"No fractional or numeric values requiring rounding were found in column `{target_col}`.", "actions": []}

            return {
                "message": (
                    f"**Proposed Table Action:** Round off numeric values in column **`{target_col}`**.\n"
                    f"- Sample changes staged: `{diffs[0]['old_val']}` &rarr; `{diffs[0]['new_val']}` (Total cells affected: **{len(diffs)}**)\n\n"
                    f"Confirm to apply changes?"
                ),
                "actions": [{
                    "type": "STAGED_CONFIRMATION",
                    "payload": {"action_type": "ROUND_COLUMN", "table_name": table_name, "column": target_col},
                    "highlights": {"cell_diffs": diffs}
                }]
            }

    def _stage_truncate_margin_of_error(self, table_name: str, query_text: str) -> dict:
        with self._db_connection() as (_, cursor):
            columns = self._get_table_columns(cursor, table_name)
            target_col = next((c for c in columns if c.lower() in query_text.lower()), None)
            search_cols = [target_col] if target_col else columns

            diffs = []
            matched_col = target_col

            for col in search_cols:
                cursor.execute(f'SELECT _rowid_, "{col}" FROM "{table_name}" WHERE "{col}" IS NOT NULL;')
                for rowid, val in cursor.fetchall():
                    if not val:
                        continue
                    str_val = str(val).strip()
                    match = re.search(r'^([+-]?\d+(?:\.\d+)?)\s*(?:±|\+-|\+/-)\s*\d+(?:\.\d+)?', str_val)
                    if match:
                        clean_base_val = match.group(1)
                        if not matched_col:
                            matched_col = col
                        diffs.append({"column": col, "old_val": str_val, "new_val": clean_base_val})

            if not diffs:
                return {"message": f"No margin-of-error strings (e.g. `1045.67 +- 1.45`) found in `{table_name}`.", "actions": []}

            return {
                "message": (
                    f"**Proposed Data Cleaning Action:** Remove error margins in column **`{matched_col}`**.\n"
                    f"- Sample transformation: `{diffs[0]['old_val']}` &rarr; `{diffs[0]['new_val']}` (Total cells affected: **{len(diffs)}**)\n\n"
                    f"Confirm execution?"
                ),
                "actions": [{
                    "type": "STAGED_CONFIRMATION",
                    "payload": {
                        "action_type": "TRUNCATE_ERROR_MARGIN",
                        "table_name": table_name,
                        "column": matched_col,
                        "diffs": diffs
                    },
                    "highlights": {"cell_diffs": diffs}
                }]
            }

    def _execute_round_column(self, cursor, table_name: str, target_col: str):
        cursor.execute(f'SELECT _rowid_, "{target_col}" FROM "{table_name}" WHERE "{target_col}" IS NOT NULL;')
        for rowid, val in cursor.fetchall():
            clean_val = self._clean_numeric_val(val)
            if isinstance(clean_val, (float, int)):
                cursor.execute(
                    f'UPDATE "{table_name}" SET "{target_col}" = ? WHERE _rowid_ = ?;',
                    (int(round(clean_val)), rowid)
                )

    def _execute_truncate_error_margin(self, cursor, table_name: str, diffs: list):
        for item in diffs:
            col, old_val, new_val = item.get("column"), item.get("old_val"), item.get("new_val")
            parsed_new = self._clean_numeric_val(new_val)
            cursor.execute(
                f'UPDATE "{table_name}" SET "{col}" = ? WHERE "{col}" = ? OR CAST("{col}" AS TEXT) = ?;',
                (parsed_new, old_val, old_val)
            )
