import sqlite3
import re

class AIService:
    def __init__(self, db_path="session_cache/working_session.db"):
        self.db_path = db_path

    def _get_user_columns_for_duplicates(self, cursor, table_name: str) -> list:
        """Returns user content columns, excluding primary keys and internal rowid aliases."""
        cursor.execute(f'PRAGMA table_info("{table_name}");')
        cols_info = cursor.fetchall()
        
        user_cols = []
        for col in cols_info:
            col_name = col[1]
            is_pk = col[5] == 1
            if col_name.lower() in ("_row_id", "_rowid_", "rowid", "oid", "id"):
                continue
            if is_pk:
                continue
            user_cols.append(col_name)
            
        return user_cols

    def process_query(self, query_text: str, active_table: str = "Table1") -> dict:
        query_lower = query_text.lower()

        if any(kw in query_lower for kw in ["average of", "avg of", "top", "merge columns", "replace with average"]):
            return self._handle_subject_average(active_table, query_text)

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

        elif any(kw in query_lower for kw in ["total cost", "sum", "total price", "bought"]):
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

    def confirm_action(self, action_payload: dict) -> dict:
        action_type = action_payload.get("action_type")
        table_name = action_payload.get("table_name")

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            if action_type == "REMOVE_DUPLICATES":
                user_cols = self._get_user_columns_for_duplicates(cursor, table_name)
                if not user_cols:
                    return {"message": "No data columns found to remove duplicates.", "actions": []}

                group_exprs = [f'TRIM(CAST("{c}" AS TEXT))' for c in user_cols]
                group_str = ", ".join(group_exprs)

                delete_sql = f"""
                    DELETE FROM "{table_name}"
                    WHERE _rowid_ NOT IN (
                        SELECT MIN(_rowid_)
                        FROM "{table_name}"
                        GROUP BY {group_str}
                    );
                """
                cursor.execute(delete_sql)
                conn.commit()
                msg = f"Successfully removed duplicate rows from `{table_name}`."

            elif action_type == "UPDATE_CELL_VALUE":
                target_col = action_payload.get("column")
                old_val = action_payload.get("old_value")
                new_val = action_payload.get("new_value")

                def parse_val(v):
                    try:
                        return int(v)
                    except (ValueError, TypeError):
                        try:
                            return float(v)
                        except (ValueError, TypeError):
                            return v

                parsed_old = parse_val(old_val)
                parsed_new = parse_val(new_val)

                if target_col:
                    cursor.execute(
                        f'UPDATE "{table_name}" SET "{target_col}" = ? WHERE "{target_col}" = ? OR CAST("{target_col}" AS TEXT) = ?;',
                        (parsed_new, parsed_old, str(old_val))
                    )
                else:
                    cursor.execute(f'PRAGMA table_info("{table_name}");')
                    all_cols = [info[1] for info in cursor.fetchall()]
                    for col in all_cols:
                        cursor.execute(
                            f'UPDATE "{table_name}" SET "{col}" = ? WHERE "{col}" = ? OR CAST("{col}" AS TEXT) = ?;',
                            (parsed_new, parsed_old, str(old_val))
                        )

                conn.commit()
                msg = f"Updated values from `{old_val}` to `{new_val}` in `{table_name}`."

            elif action_type == "ADD_AVERAGE_COLUMN":
                new_col = action_payload.get("new_col")
                source_cols = action_payload.get("source_cols")
                drop_originals = action_payload.get("drop_originals", False)

                cursor.execute(f'PRAGMA table_info("{table_name}");')
                existing_cols = [info[1] for info in cursor.fetchall()]

                if new_col not in existing_cols:
                    cursor.execute(f'ALTER TABLE "{table_name}" ADD COLUMN "{new_col}" REAL;')

                sum_parts = [
                    f'COALESCE(CAST(REPLACE(REPLACE("{c}", "$", ""), ",", "") AS REAL), 0)'
                    for c in source_cols
                ]
                sum_expression = " + ".join(sum_parts)
                count_expression = len(source_cols)
                
                update_sql = f'UPDATE "{table_name}" SET "{new_col}" = ROUND(({sum_expression}) / {count_expression}, 2);'
                cursor.execute(update_sql)

                if drop_originals:
                    for c in source_cols:
                        try:
                            cursor.execute(f'ALTER TABLE "{table_name}" DROP COLUMN "{c}";')
                        except sqlite3.OperationalError:
                            pass

                conn.commit()
                msg = f"Successfully created column `{new_col}` with averages from {source_cols}."

            elif action_type == "FILL_MISSING":
                target_col = action_payload.get("column")
                fill_value = action_payload.get("fill_value")

                if target_col and target_col != "ALL_COLUMNS":
                    cursor.execute(
                        f'UPDATE "{table_name}" SET "{target_col}" = ? WHERE "{target_col}" IS NULL OR "{target_col}" = "" OR TRIM(CAST("{target_col}" AS TEXT)) = "";',
                        (fill_value,)
                    )
                else:
                    cursor.execute(f'PRAGMA table_info("{table_name}");')
                    all_cols = [info[1] for info in cursor.fetchall()]
                    for col in all_cols:
                        cursor.execute(
                            f'UPDATE "{table_name}" SET "{col}" = ? WHERE "{col}" IS NULL OR "{col}" = "" OR TRIM(CAST("{col}" AS TEXT)) = "";',
                            (fill_value,)
                        )

                conn.commit()
                msg = f"Filled missing entries in `{table_name}` with `{fill_value}`."

            elif action_type == "ADD_RANK":
                target_col = action_payload.get("target_col")
                cursor.execute(f'PRAGMA table_info("{table_name}");')
                existing_cols = [info[1] for info in cursor.fetchall()]
                
                if "Rank" not in existing_cols:
                    cursor.execute(f'ALTER TABLE "{table_name}" ADD COLUMN Rank INTEGER;')

                clean_col = f'CAST(REPLACE(REPLACE("{target_col}", "$", ""), ",", "") AS REAL)'
                rank_update_sql = f"""
                    WITH Ranked AS (
                        SELECT _rowid_ as rid, RANK() OVER (ORDER BY {clean_col} DESC) as computed_rank
                        FROM "{table_name}"
                    )
                    UPDATE "{table_name}"
                    SET Rank = (SELECT computed_rank FROM Ranked WHERE Ranked.rid = "{table_name}"._rowid_);
                """
                cursor.execute(rank_update_sql)
                conn.commit()
                msg = f"Rankings updated successfully in `{table_name}` based on `{target_col}`."

            else:
                return {"message": "Unknown action type.", "actions": []}

            return {
                "message": msg,
                "actions": [{"type": "REFRESH_TABLE", "table_name": table_name}]
            }

        except Exception as e:
            conn.rollback()
            return {"message": f"Error applying action: {str(e)}", "actions": []}
        finally:
            conn.close()

    def _find_duplicates(self, table_name: str) -> dict:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            user_cols = self._get_user_columns_for_duplicates(cursor, table_name)
            if not user_cols:
                return {"message": f"No content columns available to evaluate duplicates in `{table_name}`.", "actions": []}

            group_exprs = [f'TRIM(CAST("{c}" AS TEXT))' for c in user_cols]
            group_str = ", ".join(group_exprs)

            query = f'''
                SELECT MIN(_rowid_) AS primary_id, COUNT(*) 
                FROM "{table_name}" 
                GROUP BY {group_str} 
                HAVING COUNT(*) > 1;
            '''
            cursor.execute(query)
            duplicate_groups = cursor.fetchall()

            if duplicate_groups:
                dup_rowids_query = f'''
                    SELECT _rowid_ FROM "{table_name}"
                    WHERE _rowid_ NOT IN (
                        SELECT MIN(_rowid_) FROM "{table_name}" GROUP BY {group_str}
                    );
                '''
                cursor.execute(dup_rowids_query)
                dup_rowids = [r[0] for r in cursor.fetchall()]

                return {
                    "message": f"Found **{len(dup_rowids)} duplicate record(s)** across **{len(duplicate_groups)} group(s)** in `{table_name}`.",
                    "actions": [{"type": "HIGHLIGHT_DUPLICATES", "rowids": dup_rowids}]
                }
            return {"message": f"No duplicate records found in `{table_name}`.", "actions": []}
        finally:
            conn.close()

    def _stage_remove_duplicates(self, table_name: str) -> dict:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            user_cols = self._get_user_columns_for_duplicates(cursor, table_name)
            if not user_cols:
                return {"message": f"No content columns available in `{table_name}`.", "actions": []}

            group_exprs = [f'TRIM(CAST("{c}" AS TEXT))' for c in user_cols]
            group_str = ", ".join(group_exprs)

            query = f'''
                SELECT _rowid_ FROM "{table_name}"
                WHERE _rowid_ NOT IN (
                    SELECT MIN(_rowid_) FROM "{table_name}" GROUP BY {group_str}
                );
            '''
            cursor.execute(query)
            duplicate_ids = [r[0] for r in cursor.fetchall()]

            if not duplicate_ids:
                return {"message": f"No duplicate rows exist in `{table_name}` to remove.", "actions": []}

            msg = (
                f"**Proposed Action:** Remove **{len(duplicate_ids)} duplicate row(s)** from `{table_name}`.\n"
                f"Duplicate rows scheduled for removal are highlighted in **Red**.\n\n"
                f"Accept or Cancel changes?"
            )

            return {
                "message": msg,
                "actions": [{
                    "type": "STAGED_CONFIRMATION",
                    "payload": {
                        "action_type": "REMOVE_DUPLICATES",
                        "table_name": table_name
                    },
                    "highlights": {
                        "removed_rowids": duplicate_ids
                    }
                }]
            }
        finally:
            conn.close()

    def _handle_subject_average(self, table_name: str, query_text: str) -> dict:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            cursor.execute(f'PRAGMA table_info("{table_name}");')
            cols_info = cursor.fetchall()
            existing_cols = [info[1] for info in cols_info]

            query_lower = query_text.lower()
            drop_originals = any(k in query_lower for k in ["replace", "drop", "instead of", "remove originals"])

            new_col_match = re.search(r'(?:add|call it|name it|as)\s+([a-zA-Z0-9_]+)', query_lower)
            new_col = new_col_match.group(1).title() if new_col_match else "Average_Score"

            matched_cols = [c for c in existing_cols if c.lower() in query_lower and c.lower() not in ["rank", "id", "roll"]]
            top_n_match = re.search(r'top\s+(\d+)', query_lower)

            if matched_cols:
                source_cols = matched_cols
            elif top_n_match:
                n = int(top_n_match.group(1))
                numeric_cols = [c for c in existing_cols if any(k in c.lower() for k in ["marks", "mathematics", "english", "physics", "chemistry", "biology", "history", "geography", "score"])]
                source_cols = numeric_cols[:n] if numeric_cols else existing_cols[:n]
            else:
                source_cols = [c for c in existing_cols if any(k in c.lower() for k in ["marks", "mathematics", "english", "physics", "chemistry", "biology", "history", "geography", "score"])]

            if not source_cols:
                return {"message": f"Could not determine valid subject columns to average in `{table_name}`.", "actions": []}

            staged_payload = {
                "action_type": "ADD_AVERAGE_COLUMN",
                "table_name": table_name,
                "new_col": new_col,
                "source_cols": source_cols,
                "drop_originals": drop_originals
            }

            msg = (
                f"**Proposed Table Action:**\n"
                f"- Calculate average of columns: `{', '.join(source_cols)}`\n"
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
                        "removed_columns": source_cols if drop_originals else []
                    }
                }]
            }
        finally:
            conn.close()

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

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            cursor.execute(f'PRAGMA table_info("{table_name}");')
            columns = [info[1] for info in cursor.fetchall()]

            target_col = None
            for col in columns:
                cursor.execute(f'SELECT COUNT(*) FROM "{table_name}" WHERE "{col}" = ? OR CAST("{col}" AS TEXT) = ?;', (old_val, old_val))
                if cursor.fetchone()[0] > 0:
                    target_col = col
                    break

            msg = (
                f"**Proposed Cell Edit in `{table_name}`:**\n"
                f"- Column: `{target_col or 'All Columns'}`\n"
                f"- Change: `[{old_val}]` -> `[{new_val}]`\n\n"
                f"Confirm to apply this update."
            )

            staged_payload = {
                "action_type": "UPDATE_CELL_VALUE",
                "table_name": table_name,
                "column": target_col,
                "old_value": old_val,
                "new_value": new_val
            }

            return {
                "message": msg,
                "actions": [{
                    "type": "STAGED_CONFIRMATION",
                    "payload": staged_payload,
                    "highlights": {
                        "cell_diffs": [{
                            "column": target_col,
                            "old_val": old_val,
                            "new_val": new_val
                        }]
                    }
                }]
            }
        finally:
            conn.close()

    def _stage_fill_missing_values(self, table_name: str, query_text: str) -> dict:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            cursor.execute(f'PRAGMA table_info("{table_name}");')
            columns = [info[1] for info in cursor.fetchall()]

            fill_val_match = re.search(r'(?:with|to|as)\s+[\'"]?([^\'"]+)[\'"]?', query_text, re.IGNORECASE)
            fill_value = fill_val_match.group(1).strip() if fill_val_match else "N/A"

            target_col = next((c for c in columns if c.lower() in query_text.lower()), None)

            if target_col:
                cursor.execute(f'SELECT COUNT(*) FROM "{table_name}" WHERE "{target_col}" IS NULL OR "{target_col}" = "" OR TRIM(CAST("{target_col}" AS TEXT)) = "";')
                missing_count = cursor.fetchone()[0]
            else:
                missing_count = 0
                for col in columns:
                    cursor.execute(f'SELECT COUNT(*) FROM "{table_name}" WHERE "{col}" IS NULL OR "{col}" = "" OR TRIM(CAST("{col}" AS TEXT)) = "";')
                    missing_count += cursor.fetchone()[0]
                target_col = "ALL_COLUMNS"

            if missing_count == 0:
                return {"message": f"No missing cells found in table `{table_name}`.", "actions": []}

            msg = (
                f"**Proposed Data Cleaning Action:**\n"
                f"- Replace **{missing_count}** empty cell(s) in `{table_name}` ({'Column: ' + target_col if target_col != 'ALL_COLUMNS' else 'All Columns'}) with **`{fill_value}`**.\n\n"
                f"Confirm execution?"
            )

            return {
                "message": msg,
                "actions": [{
                    "type": "STAGED_CONFIRMATION",
                    "payload": {
                        "action_type": "FILL_MISSING",
                        "table_name": table_name,
                        "column": target_col,
                        "fill_value": fill_value
                    },
                    "highlights": {
                        "fill_preview": {
                            "column": target_col,
                            "fill_value": fill_value
                        }
                    }
                }]
            }
        finally:
            conn.close()

    def _sports_department_standings(self) -> dict:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            all_tables = [r[0] for r in cursor.fetchall()]
            sports_tables = [t for t in all_tables if any(k in t.lower() for k in ["relay", "threelegged", "solo", "sport"])]

            if not sports_tables:
                return {"message": "No sports tables found in active session database.", "actions": []}

            unions = []
            for t in sports_tables:
                unions.append(f'SELECT department_name, position FROM "{t}" WHERE position IS NOT NULL AND position != ""')

            target_table_name = "Sports_Leaderboard"

            cursor.execute(f'DROP TABLE IF EXISTS "{target_table_name}";')

            full_query = f"""
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
            """
            cursor.execute(full_query)
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
        finally:
            conn.close()

    def _generate_student_profile(self, query_text: str) -> dict:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

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

            if target_name:
                sql = f"""
                    CREATE TABLE "{target_table_name}" AS
                    SELECT 
                        m.student_name AS "Student Name", 
                        m.total AS "Total Marks", 
                        c.career_aspiration AS "Career Aspiration", 
                        p.phone_number AS "Phone Number"
                    FROM marks m
                    LEFT JOIN career_preferences c ON LOWER(m.student_name) = LOWER(c.student_name)
                    LEFT JOIN personal_details p ON LOWER(m.student_name) = LOWER(p.student_name)
                    WHERE LOWER(m.student_name) LIKE ?;
                """
                cursor.execute(sql, (f"%{target_name.lower()}%",))
            else:
                sql = f"""
                    CREATE TABLE "{target_table_name}" AS
                    SELECT 
                        m.student_name AS "Student Name", 
                        m.total AS "Total Marks", 
                        c.career_aspiration AS "Career Aspiration", 
                        p.phone_number AS "Phone Number"
                    FROM marks m
                    LEFT JOIN career_preferences c ON LOWER(m.student_name) = LOWER(c.student_name)
                    LEFT JOIN personal_details p ON LOWER(m.student_name) = LOWER(p.student_name);
                """
                cursor.execute(sql)

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
        finally:
            conn.close()

    def _calculate_sum(self, table_name: str) -> dict:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute(f'PRAGMA table_info("{table_name}");')
            columns = [info[1] for info in cursor.fetchall()]
            target_col = next((c for c in columns if any(k in c.lower() for k in ["price", "cost", "amount", "value", "total"])), None)

            if not target_col:
                return {"message": f"No numeric price/cost column found in `{table_name}`.", "actions": []}

            clean_col = f'CAST(REPLACE(REPLACE("{target_col}", "$", ""), ",", "") AS REAL)'
            bought_col = next((c for c in columns if c.lower() in ["bought", "status", "purchased"]), None)
            
            if bought_col:
                query = f'SELECT SUM({clean_col}) FROM "{table_name}" WHERE LOWER("{bought_col}") in (\'yes\', \'y\', \'true\', \'1\');'
                cursor.execute(query)
                total = cursor.fetchone()[0] or 0.0
                msg = f"Total sum of **{target_col}** for bought items in `{table_name}`: **${total:.2f}**"
            else:
                query = f'SELECT SUM({clean_col}) FROM "{table_name}";'
                cursor.execute(query)
                total = cursor.fetchone()[0] or 0.0
                msg = f"Total sum of **{target_col}** in `{table_name}`: **${total:.2f}**"

            return {"message": msg, "actions": []}
        finally:
            conn.close()

    def _stage_rank_column(self, table_name: str, query_text: str) -> dict:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute(f'PRAGMA table_info("{table_name}");')
            columns = [info[1] for info in cursor.fetchall()]

            target_col = next((c for c in columns if c.lower() in query_text.lower() and c.lower() not in ["rank", "id"]), None)
            if not target_col:
                target_col = next((c for c in columns if c.lower() in ["total_score", "final_score", "total", "marks", "score"]), columns[0])

            msg = (
                f"**Proposed Table Action:** Add **Rank** column calculated from **`{target_col}`**.\n"
                f"New column will be highlighted in **Green**.\n\n"
                f"Accept or Cancel modifications?"
            )

            return {
                "message": msg,
                "actions": [{
                    "type": "STAGED_CONFIRMATION",
                    "payload": {
                        "action_type": "ADD_RANK",
                        "table_name": table_name,
                        "target_col": target_col
                    },
                    "highlights": {
                        "added_columns": ["Rank"]
                    }
                }]
            }
        finally:
            conn.close()

    def _check_missing_values(self, table_name: str) -> dict:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute(f'PRAGMA table_info("{table_name}");')
            columns = [info[1] for info in cursor.fetchall()]
            total_missing = 0
            for col in columns:
                cursor.execute(f'SELECT COUNT(*) FROM "{table_name}" WHERE "{col}" IS NULL OR "{col}" = "" OR TRIM(CAST("{col}" AS TEXT)) = "";')
                total_missing += cursor.fetchone()[0]

            return {
                "message": f"Audit for `{table_name}`: Found **{total_missing}** missing/empty cells.",
                "actions": [{"type": "HIGHLIGHT_MISSING"}]
            }
        finally:
            conn.close()
