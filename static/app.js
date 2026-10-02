document.addEventListener('DOMContentLoaded', () => {

    let tablesData = {};
    let activeTable = null;
    let isDirty = false;
    let contextTargetTab = null;

    let isMouseDown = false;
    let startCell = null;

    const TOTAL_ROWS = 100;
    const TOTAL_COLS = 26;

    let undoStack = [];
    let redoStack = [];
    const MAX_HISTORY = 50;
    let cellEditSnapshot = null;

    // Pagination State
    let currentPage = 1;
    let totalPages = 1;
    const pageSize = 100;

    // DOM Elements
    const btnFiles = document.getElementById('btn-files');
    const fileSidebar = document.getElementById('file-sidebar');
    const btnCloseFiles = document.getElementById('btn-close-files');

    const btnAiToggle = document.getElementById('btn-ai-toggle');
    const aiSidebar = document.getElementById('ai-sidebar');
    const btnCloseAi = document.getElementById('btn-close-ai');

    const dbFilenameDisplay = document.getElementById('db-filename-display');
    const dbDirtyIndicator = document.getElementById('db-dirty-indicator');

    const tabsContainer = document.getElementById('tabs-container');
    const btnAddTable = document.getElementById('btn-add-table');

    const gridHeader = document.getElementById('grid-header');
    const gridBody = document.getElementById('grid-body');

    const contextMenu = document.getElementById('tab-context-menu');
    const menuDeleteTable = document.getElementById('menu-delete-table');
    const menuRenameTable = document.getElementById('menu-rename-table');

    const menuImport = document.getElementById('menu-import');
    const menuNew = document.getElementById('menu-new');
    const menuOpen = document.getElementById('menu-open');
    const menuSave = document.getElementById('menu-save');
    const menuSaveAs = document.getElementById('menu-save-as');
    const menuExport = document.getElementById('menu-export');

    const btnQuickSave = document.getElementById('btn-quick-save');
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    // Search State & Elements
    let searchMatches = [];
    let currentMatchIndex = -1;
    let activeSearchQuery = '';
    let userSelectedCols = null;

    const searchScopeBtn = document.getElementById('btn-search-scope');
    const searchOverlay = document.getElementById('search-modal-overlay');
    const btnCloseSearch = document.getElementById('btn-close-search');

    const searchInput = document.getElementById('search-input');
    const chkMatchCase = document.getElementById('chk-match-case');
    const chkMatchWord = document.getElementById('chk-match-word');

    const chkAllTables = document.getElementById('chk-all-tables');
    const chkAllCols = document.getElementById('chk-all-cols');
    const searchTablesList = document.getElementById('search-tables-list');
    const searchColsList = document.getElementById('search-cols-list');

    const searchMatchStatus = document.getElementById('search-match-status');
    const btnFindPrev = document.getElementById('btn-find-prev');
    const btnFindNext = document.getElementById('btn-find-next');

    let fileOpenInput = null;
    let fileImportInput = null;
    let activeFileHandle = null;
    let hasBeenSavedBefore = false;
    let currentSortState = new Map();

    // Terminal / Logs Elements
    const logsToggleBtn = document.getElementById("btn-logs-toggle");
    const logsModal = document.getElementById("logs-modal");
    const logsWindow = document.getElementById("logs-window");
    const logsCloseBtn = document.getElementById("logs-close-btn");
    const logsMaximizeBtn = document.getElementById("logs-maximize-btn");
    const logsContent = document.getElementById("logs-content");

    const pageInput = document.getElementById("current-page-input");
    const totalPagesSpan = document.getElementById("total-pages");


    // Dialog System
    const Dialog = {
        overlay: null,
        box: null,

        init() {
            this.overlay = document.createElement('div');
            this.overlay.className = 'custom-dialog-overlay hidden';
            this.overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999;';

            this.box = document.createElement('div');
            this.box.className = 'custom-dialog-box';
            this.box.style.cssText = 'background:#fff;border-radius:8px;padding:20px;min-width:320px;max-width:480px;box-shadow:0 4px 20px rgba(0,0,0,0.15);font-family:inherit;';

            this.overlay.appendChild(this.box);
            document.body.appendChild(this.overlay);
        },

        close() {
            if (this.overlay) {
                this.overlay.classList.add('hidden');
                this.box.innerHTML = '';
            }
        },

        alert(message, title = 'Notification') {
            return new Promise((resolve) => {
                this.box.innerHTML = `
                    <h3 style="margin:0 0 10px;font-size:16px;">${title}</h3>
                    <p style="margin:0 0 20px;font-size:14px;color:#444;">${message}</p>
                    <div style="display:flex;justify-content:flex-end;">
                        <button id="dlg-btn-ok" style="padding:6px 16px;border:none;background:#2563eb;color:#fff;border-radius:4px;cursor:pointer;">OK</button>
                    </div>
                `;
                this.overlay.classList.remove('hidden');
                const btnOk = this.box.querySelector('#dlg-btn-ok');
                btnOk.focus();
                btnOk.addEventListener('click', () => {
                    this.close();
                    resolve();
                });
            });
        },

        confirm(message, title = 'Confirm Action') {
            return new Promise((resolve) => {
                this.box.innerHTML = `
                    <h3 style="margin:0 0 10px;font-size:16px;">${title}</h3>
                    <p style="margin:0 0 20px;font-size:14px;color:#444;">${message}</p>
                    <div style="display:flex;justify-content:flex-end;gap:8px;">
                        <button id="dlg-btn-cancel" style="padding:6px 16px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Cancel</button>
                        <button id="dlg-btn-confirm" style="padding:6px 16px;border:none;background:#dc2626;color:#fff;border-radius:4px;cursor:pointer;">Delete</button>
                    </div>
                `;
                this.overlay.classList.remove('hidden');
                this.box.querySelector('#dlg-btn-cancel').addEventListener('click', () => {
                    this.close();
                    resolve(false);
                });
                const btnConfirm = this.box.querySelector('#dlg-btn-confirm');
                btnConfirm.focus();
                btnConfirm.addEventListener('click', () => {
                    this.close();
                    resolve(true);
                });
            });
        },

        prompt(message, defaultValue = '', title = 'Input Required') {
            return new Promise((resolve) => {
                this.box.innerHTML = `
                    <h3 style="margin:0 0 10px;font-size:16px;">${title}</h3>
                    <p style="margin:0 0 10px;font-size:14px;color:#444;">${message}</p>
                    <input type="text" id="dlg-input" value="${defaultValue}" style="width:100%;padding:8px;box-sizing:border-box;margin-bottom:20px;border:1px solid #ccc;border-radius:4px;">
                    <div style="display:flex;justify-content:flex-end;gap:8px;">
                        <button id="dlg-btn-cancel" style="padding:6px 16px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Cancel</button>
                        <button id="dlg-btn-ok" style="padding:6px 16px;border:none;background:#2563eb;color:#fff;border-radius:4px;cursor:pointer;">OK</button>
                    </div>
                `;
                this.overlay.classList.remove('hidden');
                const input = this.box.querySelector('#dlg-input');
                input.focus();
                input.select();

                const submit = () => {
                    const val = input.value;
                    this.close();
                    resolve(val);
                };

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') submit();
                    if (e.key === 'Escape') {
                        this.close();
                        resolve(null);
                    }
                });

                this.box.querySelector('#dlg-btn-cancel').addEventListener('click', () => {
                    this.close();
                    resolve(null);
                });
                this.box.querySelector('#dlg-btn-ok').addEventListener('click', submit);
            });
        },

        unsavedChanges(actionName = 'continuing') {
            return new Promise((resolve) => {
                this.box.innerHTML = `
                    <h3 style="margin:0 0 10px;font-size:16px;">Unsaved Changes</h3>
                    <p style="margin:0 0 20px;font-size:14px;color:#444;">Do you want to save the changes you made before ${actionName}?</p>
                    <div style="display:flex;justify-content:flex-end;gap:8px;">
                        <button id="dlg-btn-save" style="padding:6px 14px;border:none;background:#2563eb;color:#fff;border-radius:4px;cursor:pointer;">Save Changes</button>
                        <button id="dlg-btn-dontsave" style="padding:6px 14px;border:1px solid #ccc;background:#f3f4f6;color:#374151;border-radius:4px;cursor:pointer;">Don't Save</button>
                        <button id="dlg-btn-cancel" style="padding:6px 14px;border:1px solid #ccc;background:#fff;color:#374151;border-radius:4px;cursor:pointer;">Cancel</button>
                    </div>
                `;
                this.overlay.classList.remove('hidden');
                this.box.querySelector('#dlg-btn-save').focus();

                this.box.querySelector('#dlg-btn-save').addEventListener('click', () => {
                    this.close();
                    resolve('save');
                });
                this.box.querySelector('#dlg-btn-dontsave').addEventListener('click', () => {
                    this.close();
                    resolve('dontsave');
                });
                this.box.querySelector('#dlg-btn-cancel').addEventListener('click', () => {
                    this.close();
                    resolve('cancel');
                });
            });
        }
    };

    // Application Initialization
    async function init() {
        await fetch('/api/init', { method: 'POST' });
        Dialog.init();
        createFileInputs();

        await fetchTableList();

        if (Object.keys(tablesData).length === 0) {
            initDefaultTable();
        } else {
            activeTable = Object.keys(tablesData)[0] || null;
            await loadPageData(activeTable, 1);
        }

        currentSortState.clear();
        renderTabs();
        renderGrid();
        resetHistory();
        attachEventListeners();
    }

    async function sendAIQuery(queryText) {
        try {
            const response = await fetch('/api/ai/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: queryText,
                    active_table: activeTable
                })
            });

            if (!response.ok) {
                throw new Error(`Server status ${response.status}`);
            }

            const data = await response.json();
            handleAIQueryResponse(data);
            return data;
        } catch (error) {
            console.error('Error executing AI Query:', error);
            renderChatMessage(`⚠️ Error processing request: ${error.message}`, 'bot');
        }
    }

    async function handleSendMessage() {
        const aiInput = document.getElementById('ai-input');
        if (!aiInput) return;

        const query = aiInput.value.trim();
        if (!query) return;

        renderChatMessage(query, 'user');
        aiInput.value = '';

        const thinkingBubble = renderChatMessage('', 'thinking');

        try {
            await sendAIQuery(query);
        } finally {
            if (thinkingBubble) {
                thinkingBubble.remove();
            }
        }
    }

    function handleAIQueryResponse(data) {
        if (!data) return;

        if (data.message) {
            renderChatMessage(data.message, 'bot');
        }

        if (data.actions && Array.isArray(data.actions)) {
            executeAIActions(data.actions);
        }
    }

    // Global AI Staging Variable
    let stagedPayload = null;

    async function confirmAIAction(accepted) {
        clearConfirmationButtons();

        if (!stagedPayload && accepted) {
            console.warn('No staged payload available to confirm.');
            return;
        }

        const payloadToSend = stagedPayload;
        stagedPayload = null;

        try {
            const response = await fetch('/api/ai/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    payload: payloadToSend,
                    accepted: accepted
                })
            });

            if (!response.ok) {
                throw new Error(`Server status ${response.status}`);
            }

            const data = await response.json();

            // Clear existing staged visual previews/highlights
            clearAIHighlights();

            if (data.message) {
                renderChatMessage(data.message, 'bot');
            }

            // Execute returned post-confirmation actions
            if (data.actions && Array.isArray(data.actions)) {
                await executeAIActions(data.actions);
            }

            // ALWAYS refresh the grid if accepted to load fresh SQLite state
            if (accepted && !data.actions?.some(a => a.type === 'SWITCH_TABLE')) {
                await refreshWorkspaceGrid();
            }
        } catch (error) {
            console.error('Error confirming action:', error);
            renderChatMessage(`⚠️ Error confirming action: ${error.message}`, 'bot');
        }
    }

    function cancelStagedAction() {
        stagedPayload = null;
        clearConfirmationButtons();
        clearAIHighlights();
        renderChatMessage('Cancelled the staged action.', 'bot');
    }

    function renderConfirmationButtons() {
        clearConfirmationButtons(); 

        const chatBox = document.getElementById('chat-messages') || document.getElementById('chatBox');
        if (!chatBox) return;

        const btnContainer = document.createElement('div');
        btnContainer.id = 'ai-confirmation-container';
        btnContainer.className = 'ai-confirm-box flex gap-2 my-2 p-2 bg-slate-800 rounded-lg border border-slate-700';

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-medium transition';
        confirmBtn.textContent = '✓ Confirm Action';
        confirmBtn.onclick = () => confirmAIAction(true);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-sm font-medium transition';
        cancelBtn.textContent = '✕ Cancel (ESC)';
        cancelBtn.onclick = () => confirmAIAction(false);

        btnContainer.appendChild(confirmBtn);
        btnContainer.appendChild(cancelBtn);
        chatBox.appendChild(btnContainer);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function clearConfirmationButtons() {
        const container = document.getElementById('ai-confirmation-container');
        if (container) {
            container.remove();
        }
    }

    function highlightDuplicatesClientSide(skipFirst = false) {
        if (!gridBody) return;

        
        clearAIHighlights();

        let maxTableCol = -1;
        const headerCells = document.querySelectorAll('#grid-header th[data-col], #grid-body tr:first-child td[data-col]');
        headerCells.forEach(th => {
            const text = th.textContent.replace(/[▲▼↕]/g, '').trim();
            const colIdx = parseInt(th.getAttribute('data-col'), 10);
            if (text && !isNaN(colIdx)) {
                maxTableCol = Math.max(maxTableCol, colIdx);
            }
        });

        const rowsMap = new Map();
        const dataCells = gridBody.querySelectorAll('td[data-row][data-col]');

        dataCells.forEach(cell => {
            const colIdx = parseInt(cell.getAttribute('data-col'), 10);
            if (maxTableCol >= 0 && colIdx > maxTableCol) return;

            const rowNum = cell.getAttribute('data-row');
            if (!rowsMap.has(rowNum)) {
                rowsMap.set(rowNum, []);
            }   
            rowsMap.get(rowNum).push(cell);
        });

        const rowSignatureMap = new Map();

        rowsMap.forEach((cells, rowNum) => {
            cells.sort((a, b) => parseInt(a.getAttribute('data-col'), 10) - parseInt(b.getAttribute('data-col'), 10));

            const rowValues = cells.map(cell => {
                const clone = cell.cloneNode(true);
                clone.querySelectorAll('button, .sortBtn, .action-btn').forEach(btn => btn.remove());
                return clone.textContent.trim();
            });

            // Skip completely blank rows
            if (rowValues.every(val => val === '')) return;

            const rowSignature = rowValues.join(' | ');

            if (!rowSignatureMap.has(rowSignature)) {
                rowSignatureMap.set(rowSignature, []);
            }
            rowSignatureMap.get(rowSignature).push(rowNum);
        });

        rowSignatureMap.forEach((duplicateRowNums) => {
            if (duplicateRowNums.length > 1) {
                const targetRowNums = skipFirst ? duplicateRowNums.slice(1) : duplicateRowNums;
                const targetClass = skipFirst ? 'ai-highlight-remove' : 'ai-highlight-duplicate';
                targetRowNums.forEach(rowNum => {
                    const cells = rowsMap.get(rowNum);
                    if (cells) {
                        cells.forEach(cell => cell.classList.add(targetClass));
                    }
                });
            }
        });
    }


    function clearAIHighlights() {
        if (!gridBody) return;

        // Clear header highlights
        const gridHeader = document.getElementById('grid-header');
        if (gridHeader) {
            gridHeader.querySelectorAll('.ai-highlight-add, .ai-highlight-remove').forEach(th => {
                th.classList.remove('ai-highlight-add', 'ai-highlight-remove');
            });
        }

        // Clear body highlights and restore modified diff/fill innerHTML
        gridBody.querySelectorAll('.ai-highlight-duplicate, .ai-highlight-add, .ai-highlight-remove, .ai-highlight-diff, .ai-highlight-missing').forEach(cell => {
            cell.classList.remove('ai-highlight-duplicate', 'ai-highlight-add', 'ai-highlight-remove', 'ai-highlight-diff', 'ai-highlight-missing');

            // Restore original stored text if diff badge was applied
            if (cell.dataset.origText !== undefined) {
                cell.textContent = cell.dataset.origText;
                delete cell.dataset.origText;
            }
        });

        // Clear row-level deletion styling
        gridBody.querySelectorAll('tr.ai-highlight-remove').forEach(tr => tr.classList.remove('ai-highlight-remove'));

        if (typeof autoFitColumnWidth === 'function') {
            autoFitColumnWidth();
        }
    }

    // Global ESC key listener to cancel previews & clear highlights
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (typeof cancelStagedAction === 'function') {
                cancelStagedAction(); // Clears staged payload & highlights
            } else {
                clearAIHighlights();
            }
        }
    });

    async function executeAIActions(actions) {
        if (!Array.isArray(actions)) return;

        for (const action of actions) {
            switch (action.type) {
                case 'STAGED_CONFIRMATION':
                    stagedPayload = action.payload;
                    renderConfirmationButtons();

                    // Apply preview highlights attached to staged actions
                    if (action.highlights) {
                        applyStagedPreviewHighlights(action.highlights, action.payload);
                    }
                    break;

                case 'HIGHLIGHT_DUPLICATES':
                    // Client-side finding & highlighting all duplicates
                    if (typeof highlightDuplicatesClientSide === 'function') {
                        highlightDuplicatesClientSide(false);
                    }
                    break;

                case 'HIGHLIGHT_MISSING':
                    if (typeof highlightMissingCellsClientSide === 'function') {
                        highlightMissingCellsClientSide(action.column);
                    }
                    break;

                case 'CLEAR_HIGHLIGHTS':
                    clearAIHighlights();
                    break;

                case 'REFRESH_TABLE_LIST':
                    if (typeof fetchTableList === 'function') {
                        await fetchTableList();
                    }
                    break;

                case 'REFRESH_TABLE':
                    await refreshWorkspaceGrid();
                    break;

                case 'SWITCH_TABLE':
                case 'CREATE_TABLE':
                case 'DELETE_TABLE':
                    const targetTable = action.table_name || action.active_table;
                    if (typeof fetchTableList === 'function') await fetchTableList();

                    if (targetTable) {
                        activeTable = targetTable;
                        if (typeof loadPageData === 'function') {
                            await loadPageData(activeTable, 1);
                        }
                    } else {
                        await refreshWorkspaceGrid();
                    }
                    break;

                default:
                    console.log('Unhandled AI action type:', action.type);
                    break;
            }
        }

        if (typeof setDirty === 'function') setDirty(true);
    }

    function applyStagedPreviewHighlights(highlights, actionPayload) {
        if (!highlights && !actionPayload) return;

        // ------------------------------------------------------------------
        // 1. Duplicate Removal Preview
        // ------------------------------------------------------------------
        const isDuplicateAction = 
            (actionPayload && actionPayload.action_type === 'REMOVE_DUPLICATES') ||
            (highlights && (highlights.removed_rowids || highlights.action_type === 'REMOVE_DUPLICATES'));

        if (isDuplicateAction) {
            if (typeof highlightDuplicatesClientSide === 'function') {
                highlightDuplicatesClientSide(true);
            }
            return;
        }

        // ------------------------------------------------------------------
        // 2. Column Additions & Removals Preview
        // ------------------------------------------------------------------
        if (highlights.added_columns || highlights.removed_columns) {
            const addedCols = highlights.added_columns || [];
            const removedCols = highlights.removed_columns || [];
            const headerThs = document.querySelectorAll('#grid-header th[data-col], #grid-header td[data-col]');

            if (removedCols.length > 0) {
                headerThs.forEach(th => {
                    const colName = th.textContent.replace(/[▲▼↕]/g, '').trim().toLowerCase();
                    const colIdx = th.getAttribute('data-col');
                    if (removedCols.some(c => String(c).trim().toLowerCase() === colName)) {
                        th.classList.add('ai-highlight-remove');
                        gridBody.querySelectorAll(`td[data-col="${colIdx}"]`).forEach(td => td.classList.add('ai-highlight-remove'));
                    }
                });
            }

            if (addedCols.length > 0) {
                let maxColIdx = -1;
                const headerRow = document.querySelector('#grid-header tr') || document.querySelector('#grid-header');

                headerThs.forEach(th => {
                    const colIdx = parseInt(th.getAttribute('data-col'), 10);
                    if (!isNaN(colIdx)) maxColIdx = Math.max(maxColIdx, colIdx);
                });

                addedCols.forEach((newColName, offset) => {
                    let matchedTh = null;
                    headerThs.forEach(th => {
                        if (th.textContent.replace(/[▲▼↕]/g, '').trim().toLowerCase() === String(newColName).trim().toLowerCase()) {
                            matchedTh = th;
                        }
                    });

                    if (matchedTh) {
                        const colIdx = matchedTh.getAttribute('data-col');
                        matchedTh.classList.add('ai-highlight-add');
                        gridBody.querySelectorAll(`td[data-col="${colIdx}"]`).forEach(td => td.classList.add('ai-highlight-add'));
                    } else if (headerRow) {
                        const virtualColIdx = maxColIdx + 1 + offset;
                        const previewTh = document.createElement('th');
                        previewTh.setAttribute('data-col', virtualColIdx);
                        previewTh.classList.add('ai-highlight-add', 'ai-virtual-preview');
                        previewTh.textContent = newColName;
                        headerRow.appendChild(previewTh);

                        gridBody.querySelectorAll('tr').forEach((tr, rIdx) => {
                            const previewTd = document.createElement('td');
                            previewTd.setAttribute('data-col', virtualColIdx);
                            previewTd.setAttribute('data-row', rIdx);
                            previewTd.classList.add('ai-highlight-add', 'ai-virtual-preview');
                            previewTd.textContent = '—';
                            tr.appendChild(previewTd);
                        });
                    }
                });
            }
        }


        // ------------------------------------------------------------------
        // 3. Fill Missing Values Preview
        // ------------------------------------------------------------------
        if (highlights.fill_preview) {
            const targetColName = highlights.fill_preview.column;
            const fillValue = highlights.fill_preview.fill_value;

            let maxTableCol = -1;
            let targetColIdx = -1;
            const headerCells = document.querySelectorAll('#grid-header th[data-col], #grid-body tr:first-child td[data-col]');

            headerCells.forEach(th => {
                const colText = th.textContent.replace(/[▲▼↕]/g, '').trim();
                const colIdx = parseInt(th.getAttribute('data-col'), 10);

                if (colText && !isNaN(colIdx)) {
                    maxTableCol = Math.max(maxTableCol, colIdx);
                    if (targetColName && targetColName !== "ALL_COLUMNS" && colText.toLowerCase() === String(targetColName).toLowerCase()) {
                        targetColIdx = colIdx;
                    }
                }
            });

            let maxTableRow = -1;
            const allCells = gridBody.querySelectorAll('td[data-row][data-col]');

            allCells.forEach(cell => {
                const colIdx = parseInt(cell.getAttribute('data-col'), 10);
                const rowIdx = parseInt(cell.getAttribute('data-row'), 10);

                if (colIdx <= maxTableCol && cell.textContent.trim() !== '') {
                    maxTableRow = Math.max(maxTableRow, rowIdx);
                }
            });

            allCells.forEach(cell => {
                const colIdx = parseInt(cell.getAttribute('data-col'), 10);
                const rowIdx = parseInt(cell.getAttribute('data-row'), 10);

                if (rowIdx > maxTableRow || colIdx > maxTableCol) return;
                if (targetColIdx >= 0 && colIdx !== targetColIdx) return;

                const text = cell.textContent.trim();
                if (text === '' || text === 'null') {
                    cell.dataset.origText = cell.textContent;
                    cell.innerHTML = `<span class="fill-preview-badge">${fillValue}</span>`;
                    cell.classList.add('ai-highlight-add');
                }
            });
        }

        // ------------------------------------------------------------------
        // 4. Cell Diffs Preview
        // ------------------------------------------------------------------
        if (highlights.cell_diffs && Array.isArray(highlights.cell_diffs)) {
            highlights.cell_diffs.forEach(diff => {
                const oldVal = String(diff.old_val).trim();
                const newVal = String(diff.new_val).trim();
                const targetColName = diff.column ? String(diff.column).trim().toLowerCase() : null;

                let targetColIdx = null;
                if (targetColName) {
                    document.querySelectorAll('#grid-header th[data-col]').forEach(th => {
                        if (th.textContent.replace(/[▲▼↕]/g, '').trim().toLowerCase() === targetColName) {
                            targetColIdx = th.getAttribute('data-col');
                        }
                    });
                }

                const selector = targetColIdx !== null ? `td[data-col="${targetColIdx}"]` : 'td[data-col]';
                gridBody.querySelectorAll(selector).forEach(cell => {
                    if (cell.textContent.trim() === oldVal) {
                        if (!cell.dataset.origText) cell.dataset.origText = cell.innerHTML;
                        cell.innerHTML = `<div class="diff-container"><span class="diff-old">${oldVal}</span><span class="diff-arrow">&rarr;</span><span class="diff-new">${newVal}</span></div>`;
                        cell.classList.add('ai-highlight-diff');
                    }
                });
            });
        }

        if (typeof autoFitColumnWidth === 'function') {
            autoFitColumnWidth();
        }
    }    

    function highlightMissingCellsClientSide(targetColumn) {
        if (typeof clearAIHighlights === 'function') {
            clearAIHighlights();
        }

        let maxTableCol = -1;
        let targetColIdx = -1;
        const headerCells = document.querySelectorAll('#grid-header th[data-col], #grid-body tr:first-child td[data-col]');

        headerCells.forEach(th => {
            const colText = th.textContent.replace(/[▲▼↕]/g, '').trim();
            const colIdx = parseInt(th.getAttribute('data-col'), 10);

            if (colText && !isNaN(colIdx)) {
                maxTableCol = Math.max(maxTableCol, colIdx);
                if (targetColumn && targetColumn !== "ALL_COLUMNS" && colText.toLowerCase() === String(targetColumn).toLowerCase()) {
                    targetColIdx = colIdx;
                }
            }
        });

        let maxTableRow = -1;
        const allCells = gridBody.querySelectorAll('td[data-row][data-col]');

        allCells.forEach(cell => {
            const colIdx = parseInt(cell.getAttribute('data-col'), 10);
            const rowIdx = parseInt(cell.getAttribute('data-row'), 10);

            if (colIdx <= maxTableCol && cell.textContent.trim() !== '') {
                maxTableRow = Math.max(maxTableRow, rowIdx);
            }
        });

        allCells.forEach(cell => {
            const colIdx = parseInt(cell.getAttribute('data-col'), 10);
            const rowIdx = parseInt(cell.getAttribute('data-row'), 10);

            if (rowIdx > maxTableRow || colIdx > maxTableCol) return;
            if (targetColIdx >= 0 && colIdx !== targetColIdx) return;

            const text = cell.textContent.trim();
            if (text === '' || text === 'null') {
                cell.classList.add('ai-highlight-missing');
            }
        });

        if (typeof autoFitColumnWidth === 'function') {
            autoFitColumnWidth();
        }
    }

    async function refreshWorkspaceGrid() {
        if (typeof fetchTableList === 'function') {
            await fetchTableList();
        } else if (typeof loadPageData === 'function' && activeTable) {
            await loadPageData(activeTable, currentPage || 1);
        }
        
        if (typeof renderTabs === 'function') renderTabs();
        if (typeof renderGrid === 'function') renderGrid();
    }


    function renderChatMessage(text, sender = 'bot') {
        const chatContainer = document.getElementById('chat-container') || document.getElementById('ai-chat-history');
        if (!chatContainer) {
            console.log(`[Chat - ${sender}]:`, text);
            return null;
        }

        const msgDiv = document.createElement('div');
        msgDiv.classList.add('chat-message', sender);

        if (sender === 'thinking') {
            msgDiv.innerHTML = `
                <span class="typing-dot">.</span>
                <span class="typing-dot">.</span>
                <span class="typing-dot">.</span>
            `;
        } else {
            let formattedText = String(text)
                .replace(/\\rightarrow/g, '→')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/`(.*?)`/g, '<code>$1</code>')
                .replace(/\n/g, '<br>');
            msgDiv.innerHTML = formattedText;
        }

        chatContainer.appendChild(msgDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return msgDiv;
    }

    function renderConfirmationButtons() {
        const chatContainer = document.getElementById('chat-container') || document.getElementById('ai-chat-history');
        if (!chatContainer) return;

        clearConfirmationButtons();

        const btnGroup = document.createElement('div');
        btnGroup.className = 'ai-confirmation-actions';

        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'btn btn-accept';
        acceptBtn.textContent = 'Accept Changes';
        acceptBtn.addEventListener('click', () => {
            confirmAIAction(true);
            clearAIHighlights();
        })

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => {
            confirmAIAction(false);
            clearAIHighlights();
        });

        btnGroup.appendChild(acceptBtn);
        btnGroup.appendChild(cancelBtn);

        chatContainer.appendChild(btnGroup);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function clearConfirmationButtons() {
        document.querySelectorAll('.ai-confirmation-actions').forEach(el => el.remove());
    }

    // Direct UI Listener bindings for Chat Input
    const sendBtn = document.getElementById('ai-send-btn') || document.getElementById('btn-send-ai');
    const aiInput = document.getElementById('ai-input');

    if (sendBtn) {
        sendBtn.addEventListener('click', handleSendMessage);
    }

    if (aiInput) {
        aiInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
    }

    async function syncActiveTableToBackend() {
        if (!activeTable || !tablesData[activeTable]) return;

        try {
            const response = await fetch('/api/update_staging', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table_name: activeTable,
                    columns: tablesData[activeTable].columns || [],
                    rows: tablesData[activeTable].rows || [],
                    page: currentPage, 
                    limit: pageSize    
                })
            });

            if (!response.ok) {
                console.error('Failed to sync staging table page to backend.');
            }
        } catch (error) {
            console.error('Error syncing staging table:', error);
        }
    }

    async function fetchTableList() {
        try {
            const response = await fetch('/api/tables');
            const result = await response.json();
            if (result.status === 'success' && Array.isArray(result.tables)) {
                tablesData = {};
                result.tables.forEach(tableName => {
                    tablesData[tableName] = { columns: [], rows: [] };
                });
                if (result.tables.length > 0 && !activeTable) {
                    activeTable = result.tables[0];
                }
            }
        } catch (err) {
            console.error('Error fetching table list:', err);
        }
    }


    async function loadPageData(tableName, page = 1) { 
        if (!tableName) return;
        try {
            let url = `/api/data?table=${encodeURIComponent(tableName)}&page=${page}&limit=${pageSize}`;

            const sortOrders = {};
            const columns = tablesData[tableName]?.columns || [];

            currentSortState.forEach((dir, colIdx) => {
                const colName = columns[colIdx];
                if (colName && dir && dir !== 'none') {
                    sortOrders[colName] = dir.toUpperCase();
                }
            });

            if (Object.keys(sortOrders).length > 0) {
                url += `&sort_orders=${encodeURIComponent(JSON.stringify(sortOrders))}`;
            }

            const response = await fetch(url);
            const result = await response.json();

            if (result.status === 'success') {
                const columns = result.columns || [];
                const rawRows = result.rows || result.data || [];

                tablesData[tableName] = {
                    columns: columns,
                    rows: rawRows
                };

                currentPage = result.page || page;
                totalPages = result.total_pages || 1;
                totalRowsCount = result.total_rows || 0;

                updatePaginationUI(currentPage, totalPages);
                renderGrid();
            }
        } catch (err) {
            console.error(`Error loading page ${page} for table ${tableName}:`, err);
        }
    }

    function updatePaginationUI(page, total) {
        currentPage = page;
        totalPages = total;

        // Update text input and total page counter
        if (pageInput) {
            pageInput.value = currentPage;
            pageInput.max = totalPages;
        }
    
        // Update total pages display (checks both variable names used in your snippet)
        const totalSpan = totalPagesSpan || document.getElementById('total-pages');
        if (totalSpan) {
            totalSpan.textContent = totalPages;
        }

        // Update button states
        const btnFirst = document.getElementById('btn-first-page');
        const btnPrev = document.getElementById('btn-prev-page');
        const btnNext = document.getElementById('btn-next-page');
        const btnLast = document.getElementById('btn-last-page');

        if (btnFirst) btnFirst.disabled = currentPage <= 1;
        if (btnPrev) btnPrev.disabled = currentPage <= 1;
        if (btnNext) btnNext.disabled = currentPage >= totalPages;
        if (btnLast) btnLast.disabled = currentPage >= totalPages;
    }

    function handlePageInputChange() {
        let requestedPage = parseInt(pageInput.value, 10);

        // Default to page 1 if input is empty or invalid
        if (isNaN(requestedPage) || requestedPage < 1) {
            requestedPage = 1;
        } else if (requestedPage > totalPages) {
            requestedPage = totalPages; // Cap to last page
        }

        pageInput.value = requestedPage;

        if (requestedPage !== currentPage) {
            currentPage = requestedPage;
            loadPageData(activeTable, requestedPage); 
        }
    }

    pageInput.addEventListener("change", handlePageInputChange);

    pageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            pageInput.blur(); 
        }
    });

    function renderGrid() {
        if (!gridHeader || !gridBody) return;
        gridHeader.innerHTML = '';
        gridBody.innerHTML = '';

        if (!activeTable || !tablesData[activeTable]) return;

        const currentData = tablesData[activeTable];
        const startRowOffset = (currentPage - 1) * pageSize;

        // TOP HEADER ROW (Column letters A, B, C...)
        const headerRow = document.createElement('tr');
        const coordTh = document.createElement('th');
        coordTh.id = 'cell-coordinate-display';
        coordTh.innerText = 'A1';
        coordTh.title = 'Click to select all cells in table';
        coordTh.addEventListener('click', selectAllCells);
        headerRow.appendChild(coordTh);

        for (let c = 0; c < TOTAL_COLS; c++) {
            const th = document.createElement('th');
            th.innerText = getColLetter(c);
            th.dataset.colIdx = c;
            th.addEventListener('click', () => {
                clearSelections();
                const bounds = getTableBoundaries();
                if (c <= bounds.maxCol) highlightRange(startRowOffset + 1, c, startRowOffset + bounds.maxRow, c);
            });
            headerRow.appendChild(th);
        }
        gridHeader.appendChild(headerRow);

        // ROW 0: COLUMN NAMES & SORT BUTTONS
        const row0 = document.createElement('tr');
        const row0HeaderCell = document.createElement('td');
        row0HeaderCell.className = 'row-header row-0';
        row0HeaderCell.innerText = '0';
        row0.appendChild(row0HeaderCell);

        for (let c = 0; c < TOTAL_COLS; c++) {
            const td = document.createElement('td');
            td.className = 'row-0 row-0-cell';
            td.dataset.row = 0;
            td.dataset.col = c;

            const container = document.createElement('div');
            container.className = 'col-header-container';

            const textSpan = document.createElement('span');
            textSpan.contentEditable = true;
            textSpan.className = 'col-header-text';
            textSpan.innerText = currentData.columns[c] || '';

            textSpan.addEventListener('input', (e) => {
                const val = e.target.innerText.trim();
                tablesData[activeTable].columns[c] = (val !== '0') ? val : '';
                setDirty(true);
            });

            const sortBtn = document.createElement('button');
            sortBtn.className = 'btn-col-sort';

            const colSortDir = currentSortState.get(c) || 'none';

            if (colSortDir === 'asc') {
                sortBtn.innerText = '↑';
                sortBtn.classList.add('active-sort');
            } else if (colSortDir === 'desc') {
                sortBtn.innerText = '↓';
                sortBtn.classList.add('active-sort');
            } else {
                sortBtn.innerText = '↕';
            }

            sortBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                sortActiveTable(c);
            });

            container.appendChild(textSpan);
            container.appendChild(sortBtn);
            td.appendChild(container);
            row0.appendChild(td);
        }
        gridBody.appendChild(row0);

        // DYNAMIC DATA ROWS (1-100, 101-200, etc.)
        for (let r = 0; r < TOTAL_ROWS; r++) {
            const displayRowNumber = startRowOffset + r + 1;
            const tr = document.createElement('tr');
            
            const rowHeaderCell = document.createElement('td');
            rowHeaderCell.className = 'row-header';
            rowHeaderCell.innerText = displayRowNumber;

            rowHeaderCell.addEventListener('click', () => {
                clearSelections();
                const bounds = getTableBoundaries();
                if (r + 1 <= bounds.maxRow) highlightRange(displayRowNumber, 0, displayRowNumber, bounds.maxCol);
            });

            tr.appendChild(rowHeaderCell);
            
            const rowData = currentData.rows[r];

            for (let c = 0; c < TOTAL_COLS; c++) {
                const td = document.createElement('td');
                td.contentEditable = true;
                td.dataset.row = displayRowNumber;
                td.dataset.col = c;

                let cellValue = '';

                if (rowData !== undefined && rowData !== null) {
                    if (Array.isArray(rowData)) {
                        cellValue = rowData[c];
                    } else if (typeof rowData === 'object') {
                        const colName = currentData.columns[c];
                        if (colName !== undefined && rowData[colName] !== undefined) {
                            cellValue = rowData[colName];
                        } else {
                            const keys = Object.keys(rowData);
                            if (keys[c] !== undefined) {
                                cellValue = rowData[keys[c]];
                            }
                        }
                    } else if (c === 0) {
                        cellValue = rowData;
                    }
                }

                td.innerText = (cellValue !== undefined && cellValue !== null) ? cellValue : '';

                attachCellEvents(td, displayRowNumber, c);
                tr.appendChild(td);
            }
            gridBody.appendChild(tr);
        }

        for (let c = 0; c < TOTAL_COLS; c++) {
            autoFitColumnWidth(c);
        }

        applyCurrentTableHighlights();
    }

    function renderTabs() {
        if (!tabsContainer) return;
        tabsContainer.innerHTML = '';

        Object.keys(tablesData).forEach(tableName => {
            const tab = document.createElement('div');
            tab.className = `tab ${tableName === activeTable ? 'active' : ''}`;
            tab.innerText = `${tableName}${isDirty && tableName === activeTable ? ' *' : ''}`;

            tab.addEventListener('click', async () => {
                if (activeTable === tableName) return;

                activeTable = tableName;
                if (typeof loadPageData === 'function') {
                    await loadPageData(activeTable, 1);
                }

                renderTabs();
                renderGrid();
            });

            tab.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                contextTargetTab = tableName;
                if (contextMenu) {
                    contextMenu.style.top = `${e.pageY}px`;
                    contextMenu.style.left = `${e.pageX}px`;
                    contextMenu.classList.remove('hidden');
                }
            });

            tabsContainer.appendChild(tab);
        });
    }

    // Backend Search Logic
    async function executeSearch() {
        clearSearchHighlights();
        searchMatches = [];
        currentMatchIndex = -1;

        activeSearchQuery = searchInput ? searchInput.value.trim() : '';

        if (activeSearchQuery === '') {
            if (searchMatchStatus) searchMatchStatus.innerText = '';
            updateSearchNavButtons();
            return;
        }

        // 1. Group selected columns by table name
        const searchScope = {};
        const checkedCols = searchColsList.querySelectorAll('.chk-col-item:checked');

        checkedCols.forEach(chk => {
            // chk.value is in "TableName:colIdx" format
            const [tableName, colIdxStr] = chk.value.split(':');
            const colIdx = parseInt(colIdxStr, 10);
        
            // Retrieve the clean column name from tablesData
            const colName = tablesData[tableName]?.columns[colIdx] || `Column_${colIdx + 1}`;

            if (!searchScope[tableName]) {
                searchScope[tableName] = [];
            }
                searchScope[tableName].push(colName);
        });

        try {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: activeSearchQuery,
                    match_case: chkMatchCase ? chkMatchCase.checked : false,
                    match_word: chkMatchWord ? chkMatchWord.checked : false,
                    scope: searchScope 
                })
            });

            const result = await response.json();
            if (result.status === 'success') {
                searchMatches = result.matches || [];

                if (searchMatches.length > 0) {
                    currentMatchIndex = 0;
                    await focusMatch(currentMatchIndex);
                } else {
                    if (searchMatchStatus) searchMatchStatus.innerText = 'No matches found';
                }
            }
        } catch (err) {
            console.error('Error executing backend search:', err);
        }

        updateSearchNavButtons();
    }

    async function focusMatch(index) {
        if (index < 0 || index >= searchMatches.length) return;
        const match = searchMatches[index];

        const targetPage = match.page || 1;

        if (match.table !== activeTable || targetPage !== currentPage) {
            activeTable = match.table;
            await loadPageData(activeTable, targetPage); 
            renderTabs();
        } else {
            applyCurrentTableHighlights();
        }

        // Clear previous active highlights
        gridBody.querySelectorAll('mark.active-match').forEach(m => m.classList.remove('active-match'));

        // Convert relative row to absolute row index to match DOM data-row
        const absoluteRow = ((currentPage - 1) * pageSize) + match.row;

        const cell = gridBody.querySelector(`td[data-row="${absoluteRow}"][data-col="${match.col}"]`);
        if (cell) {
            clearSelections();
            cell.classList.add('cell-selected', 'sel-top', 'sel-bottom', 'sel-left', 'sel-right');

            const activeMark = cell.querySelector('mark.search-match');
            if (activeMark) activeMark.classList.add('active-match');

            cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            if (typeof updateCoordinateDisplay === 'function') {
                updateCoordinateDisplay(absoluteRow, match.col);
            }
        }

        if (searchMatchStatus) {
            searchMatchStatus.innerText = `Showing ${index + 1} of ${searchMatches.length} matches (${match.table})`;
        }
        updateSearchNavButtons();
    }

    function applyCurrentTableHighlights() {
        clearSearchHighlights();
        if (!activeSearchQuery || searchMatches.length === 0) return;

        const isMatchCase = chkMatchCase ? chkMatchCase.checked : false;
        const isMatchWord = chkMatchWord ? chkMatchWord.checked : false;

        let regexFlags = 'g';
        if (!isMatchCase) regexFlags += 'i';

        let patternString = escapeRegExp(activeSearchQuery);
        if (isMatchWord) patternString = `\\b${patternString}\\b`;

        const searchRegex = new RegExp(`(${patternString})`, regexFlags);

        const currentPageMatches = searchMatches.filter(
            m => m.table === activeTable && (m.page || 1) === currentPage
        );

        const startRowOffset = (currentPage - 1) * pageSize;

        currentPageMatches.forEach(match => {
            const absoluteRow = startRowOffset + match.row;

            const cell = gridBody.querySelector(`td[data-row="${absoluteRow}"][data-col="${match.col}"]`);
            if (cell) {
                const cleanText = cell.innerText;
                cell.innerHTML = cleanText.replace(searchRegex, '<mark class="search-match">$1</mark>');
            }
        });
    }

    function clearSearchHighlights() {
        const cells = gridBody.querySelectorAll('td[contenteditable="true"]');
        cells.forEach(cell => {
            if (cell.querySelector('mark.search-match')) {
                cell.innerText = cell.innerText;
            }
        });
    }

    function updateSearchNavButtons() {
        const hasQuery = activeSearchQuery.trim() !== '';
        const hasMatches = searchMatches.length > 0;

        if (btnFindPrev) {
            btnFindPrev.disabled = !hasQuery || !hasMatches || currentMatchIndex <= 0;
        }
        if (btnFindNext) {
            btnFindNext.disabled = !hasQuery || !hasMatches || currentMatchIndex >= searchMatches.length - 1;
        }
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function openSearchModal() {
        if (searchOverlay) {
            populateSearchScope();
            searchOverlay.classList.remove('hidden');
            if (searchInput) {
                searchInput.focus();
                if (searchInput.value.trim() !== '') executeSearch();
            }
        }
    }

    function closeSearchModal() {
        if (searchOverlay) searchOverlay.classList.add('hidden');
    }

    function populateSearchScope() { 
        if (!searchTablesList || !searchColsList) return;

        const previousTableSelections = new Set(
            Array.from(searchTablesList.querySelectorAll('.chk-table-item:checked')).map(chk => chk.value)
        );
        const hasExistingTables = searchTablesList.children.length > 0;

        searchTablesList.innerHTML = '';
        searchColsList.innerHTML = '';

        Object.keys(tablesData).forEach(tName => {
            const item = document.createElement('label');
            item.className = 'scope-item';

            const isChecked = hasExistingTables ? previousTableSelections.has(tName) : (tName === activeTable);

            item.innerHTML = `<input type="checkbox" class="chk-table-item" value="${tName}" ${isChecked ? 'checked' : ''}> ${tName}`;
            searchTablesList.appendChild(item);
        });

        updateColumnsChecklist();
        syncAllTablesCheckbox();

        searchTablesList.querySelectorAll('.chk-table-item').forEach(chk => {
            chk.addEventListener('change', () => {
                syncAllTablesCheckbox();
                updateColumnsChecklist();
                executeSearch();
            });
        });
    }

    function updateColumnsChecklist() {
        if (!searchColsList) return;

        const currentCheckboxes = searchColsList.querySelectorAll('.chk-col-item');
        if (currentCheckboxes.length > 0) {
            if (!userSelectedCols) userSelectedCols = new Set();
            currentCheckboxes.forEach(chk => {
                if (chk.checked) userSelectedCols.add(chk.value);
                else userSelectedCols.delete(chk.value);
            });
        }

        searchColsList.innerHTML = '';

        const selectedTables = Array.from(searchTablesList.querySelectorAll('.chk-table-item:checked')).map(c => c.value);

        selectedTables.forEach(tName => {
            const tData = tablesData[tName];
            if (tData && tData.columns) {
                tData.columns.forEach((colName, cIdx) => {
                    const displayName = (colName && colName.trim() !== '') ? colName : getColLetter(cIdx);
                    const colValue = `${tName}:${cIdx}`;

                    const isChecked = userSelectedCols === null ? true : userSelectedCols.has(colValue);
                
                    const item = document.createElement('label');
                    item.className = 'scope-item';
                    item.innerHTML = `<input type="checkbox" class="chk-col-item" value="${colValue}" ${isChecked ? 'checked' : ''}> ${displayName} <span class="table-tag">(${tName})</span>`;
                    searchColsList.appendChild(item);
                });
            }
        });

        syncAllColsCheckbox();

        searchColsList.querySelectorAll('.chk-col-item').forEach(chk => {
            chk.addEventListener('change', () => {
                if (!userSelectedCols) userSelectedCols = new Set();
                if (chk.checked) userSelectedCols.add(chk.value);
                else userSelectedCols.delete(chk.value);

                syncAllColsCheckbox();
                executeSearch();
            });
        });
    }

    function syncAllTablesCheckbox() {
        if (!chkAllTables || !searchTablesList) return;
        const tableCheckboxes = Array.from(searchTablesList.querySelectorAll('.chk-table-item'));
        chkAllTables.checked = tableCheckboxes.length > 0 && tableCheckboxes.every(chk => chk.checked);
    }

    function syncAllColsCheckbox() {
        if (!chkAllCols || !searchColsList) return;
        const colCheckboxes = Array.from(searchColsList.querySelectorAll('.chk-col-item'));
        chkAllCols.checked = colCheckboxes.length > 0 && colCheckboxes.every(chk => chk.checked);
    }

    // File Import / Open Operations
    async function confirmUnsavedGuard(actionLabel) {
        if (!isDirty) return true;
        const choice = await Dialog.unsavedChanges(actionLabel);
        if (choice === 'save') {
            await saveDatabase();
            return true;
        }
        return choice === 'dontsave';
    }

    async function handleFileImport() {
        const shouldProceed = await confirmUnsavedGuard('importing data');
        if (!shouldProceed) return;

        fileImportInput.value = '';
        fileImportInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch('/api/import', { method: 'POST', body: formData });
                const result = await res.json();

                if (result.status === 'success') {
                    saveState();

                    if (result.tables && Object.keys(result.tables).length > 0) {
                        Object.keys(result.tables).forEach(tName => {
                            const tObj = result.tables[tName] || {};
                            tablesData[tName] = {
                                columns: Array.isArray(tObj.columns) ? tObj.columns : [],
                                rows: Array.isArray(tObj.rows) ? tObj.rows : []
                            };
                        });
                        activeTable = Object.keys(result.tables)[0];
                    } else if (result.data && Object.keys(result.data).length > 0) {
                        Object.keys(result.data).forEach(tName => {
                            const tObj = result.data[tName] || {};
                            tablesData[tName] = {
                                columns: Array.isArray(tObj.columns) ? tObj.columns : [],
                                rows: Array.isArray(tObj.rows) ? tObj.rows : []
                            };
                        });
                        activeTable = Object.keys(result.data)[0];
                    } else if (result.columns || result.rows) {
                        const importedTableName = result.table_name || file.name.replace(/\.[^/.]+$/, '') || 'ImportedTable';
                        tablesData[importedTableName] = {
                            columns: Array.isArray(result.columns) ? result.columns : [],
                            rows: Array.isArray(result.rows) ? result.rows : []
                        };
                        activeTable = importedTableName;
                    }

                    if (activeTable && typeof loadPageData === 'function') {
                        await loadPageData(activeTable, 1);
                    }

                    setDirty(true);
                    renderTabs();
                    renderGrid();
                } else {
                    await Dialog.alert(`Import failed: ${result.message}`, 'Import Error');
                }
            } catch (err) {
                await Dialog.alert(`Import request failed: ${err.message}`, 'Import Error');
            }
        };
        fileImportInput.click();
    }

    async function handleFileOpen() {
        const shouldProceed = await confirmUnsavedGuard('opening a new file');
        if (!shouldProceed) return;

        if ('showOpenFilePicker' in window) {
            try {
                const [handle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'SQLite Database File (.db)',
                        accept: { 'application/x-sqlite3': ['.db'] }
                    }],
                    multiple: false
                });

                const file = await handle.getFile();
                activeFileHandle = handle; 

                const formData = new FormData();
                formData.append('file', file);

                const res = await fetch('/api/load', { method: 'POST', body: formData });
                const result = await res.json();

                if (result.status === 'success') {
                    const rawTables = result.data || result.tables || {};
                    tablesData = {};

                    Object.keys(rawTables).forEach(tName => {
                        tablesData[tName] = {
                            columns: rawTables[tName].columns || [],
                            rows: rawTables[tName].rows || rawTables[tName].data || []
                        };
                    });
                    
                    const tableNames = Object.keys(tablesData);
                    if (tableNames.length === 0) {
                        initDefaultTable();
                    } else {
                        activeTable = tableNames[0];
                        await loadPageData(activeTable, 1);
                    }

                    if (dbFilenameDisplay) dbFilenameDisplay.textContent = handle.name;

                    hasBeenSavedBefore = true;
                    currentSortState.clear();
                    resetHistory();
                    setDirty(false);
                    renderTabs();
                    renderGrid();
                } else {
                    await Dialog.alert(`Open failed: ${result.message}`, 'Error');
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    await Dialog.alert(`Open failed: ${err.message}`, 'Error');
                }
            }
        } else {
            fileOpenInput.value = '';
            fileOpenInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const formData = new FormData();
                formData.append('file', file);

                try {
                    const response = await fetch('/api/load', {
                        method: 'POST',
                        body: formData
                    });

                    const result = await response.json();

                    if (result.status === 'success') {
                        const rawTables = result.data || result.tables || {};
                        tablesData = {};

                        Object.keys(rawTables).forEach(tName => {
                            tablesData[tName] = {
                                columns: rawTables[tName].columns || [],
                                rows: rawTables[tName].rows || rawTables[tName].data || []
                            };
                        });

                        const tableNames = Object.keys(tablesData);
                        if (tableNames.length === 0) {
                            initDefaultTable();
                        } else {
                            activeTable = tableNames[0];
                            await loadPageData(activeTable, 1);
                        }

                        if (dbFilenameDisplay) dbFilenameDisplay.textContent = result.filename || file.name;
                        activeFileHandle = null;
                        hasBeenSavedBefore = true;
                        currentSortState.clear();
                        resetHistory();
                        setDirty(false);
                        renderTabs();
                        renderGrid();
                    } else {
                        await Dialog.alert(`Error loading database file: ${result.message}`, 'Load Error');
                    }
                } catch (err) {
                    await Dialog.alert(`Open failed: ${err.message}`, 'Error');
                }
            };
            fileOpenInput.click();
        }
    }

    // Terminal & Execution SQL Log Syntax Highlighting
    function highlightSqlLog(rawLogLine) {
        if (!rawLogLine) return "";

        let timestampHtml = "";
        let levelHtml = "";

        // 1. Extract Timestamp (HH:MM:SS) and Log Level [INFO/WARNING/ERROR]
        let line = rawLogLine.replace(/^(\d{2}:\d{2}:\d{2})\s+\[(INFO\vert{}WARNING\vert{}ERROR)\]\s*/, (match, ts, level) => {
            timestampHtml = `<span class="log-timestamp">${ts}</span> `;
            const levelClass = level.toLowerCase() === 'error' ? 'log-level-error' : 'log-level-info';
            levelHtml = `<span class="${levelClass}">[${level}]</span> `;
            return "";
        });

        // 2. Remove "EXEC SQL:" prefix
        line = line.replace(/EXEC SQL:\s*/g, "");

        // 3. Escape HTML entities
        let safeSql = line
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // 4. Tokenize strings and table/column names to protect them from keyword replacement
        safeSql = safeSql.replace(/'([^']*)'/g, '___STR___$1___STR___');
        safeSql = safeSql.replace(/"([^"]+)"/g, '___TBL___$1___TBL___');

        // 5. Highlight SQL Keywords
        const sqlKeywordsRegex = /\b(SELECT|UPDATE|SET|WHERE|INSERT INTO|VALUES|DELETE FROM|CREATE TABLE|ALTER TABLE|ADD COLUMN|DROP COLUMN|DROP TABLE|IF EXISTS|BEGIN|COMMIT|PRAGMA|FROM|ORDER BY|ASC|DESC|INTEGER|TEXT|REAL)\b/gi;
        safeSql = safeSql.replace(sqlKeywordsRegex, (match) => `<span class="sql-keyword">${match.toUpperCase()}</span>`);

        // 6. Highlight Standalone Numbers
        safeSql = safeSql.replace(/\b(\d+)\b/g, '<span class="sql-number">$1</span>');

        // 7. Restore Strings ('...') and Table/Column Identifiers ("...") with proper HTML styling
        safeSql = safeSql
            .replace(/___STR___(.*?)___STR___/g, '\'<span class="sql-string">$1</span>\'')
            .replace(/___TBL___(.*?)___TBL___/g, '"<span class="sql-table">$1</span>"');

        return `<div class="log-line">${timestampHtml}${levelHtml}${safeSql}</div>`;
    }

    async function fetchLogs() {
        if (!logsContent) return;

        try {
            logsContent.innerHTML = '<div class="log-line system-msg">Fetching execution logs...</div>';
        
            const response = await fetch("/api/logs?limit=50");
            const result = await response.json();

            if (result.status === "success" && Array.isArray(result.logs)) {
                if (result.logs.length === 0) {
                    logsContent.innerHTML = '<div class="log-line system-msg">No SQL queries recorded in this session.</div>';
                    return;
                }
                logsContent.innerHTML = result.logs.map(highlightSqlLog).join("");
                logsContent.scrollTop = logsContent.scrollHeight;
            } else {
                logsContent.innerHTML = `<div class="log-line system-msg" style="color: #f48771;">Failed to load logs: ${result.message || "Unknown error"}</div>`;
            }
        } catch (error) {
            logsContent.innerHTML = `<div class="log-line system-msg" style="color: #f48771;">Error connecting to server: ${error.message}</div>`;
        }
    }

    // Core Helpers & Data Management
    function initDefaultTable() {
        tablesData = {
            'Table1': {
                columns: ['Column1', 'Column2'],
                rows: []
            }
        };
        activeTable = 'Table1';
    }

    function createFileInputs() {
        fileOpenInput = document.createElement('input');
        fileOpenInput.type = 'file';
        fileOpenInput.accept = '.db,.sqlite,.sqlite3';
        fileOpenInput.style.display = 'none';
        document.body.appendChild(fileOpenInput);

        fileImportInput = document.createElement('input');
        fileImportInput.type = 'file';
        fileImportInput.accept = '.xlsx';
        fileImportInput.style.display = 'none';
        document.body.appendChild(fileImportInput);
    }

    function cloneState(data) {
        return JSON.parse(JSON.stringify(data));
    }

    function saveState() {
        undoStack.push(cloneState(tablesData));
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack = [];
        updateUndoRedoUI();
    }

    function updateUndoRedoUI() {
        if (btnUndo) {
            btnUndo.disabled = undoStack.length === 0;
            btnUndo.style.opacity = undoStack.length === 0 ? '0.4' : '1';
            btnUndo.style.cursor = undoStack.length === 0 ? 'not-allowed' : 'pointer';
        }
        if (btnRedo) {
            btnRedo.disabled = redoStack.length === 0;
            btnRedo.style.opacity = redoStack.length === 0 ? '0.4' : '1';
            btnRedo.style.cursor = redoStack.length === 0 ? 'not-allowed' : 'pointer';
        }
    }

    async function undo() {
        if (undoStack.length === 0) return;

        redoStack.push(cloneState(tablesData));
        tablesData = undoStack.pop();

        if (!tablesData[activeTable]) {
            activeTable = Object.keys(tablesData)[0] || null;
        }

        setDirty(true);
        renderTabs();
        renderGrid();
        updateUndoRedoUI();
        await syncActiveTableToBackend();
    }

    async function redo() {
        if (redoStack.length === 0) return;

        undoStack.push(cloneState(tablesData));
        tablesData = redoStack.pop();

        if (!tablesData[activeTable]) {
            activeTable = Object.keys(tablesData)[0] || null;
        }

        setDirty(true);
        renderTabs();
        renderGrid();
        updateUndoRedoUI();
        await syncActiveTableToBackend();
    }

    function resetHistory() {
        undoStack = [];
        redoStack = [];
        cellEditSnapshot = null;
        updateUndoRedoUI();
    }

    function setDirty(state = true) {
        isDirty = state;
        if (dbDirtyIndicator) {
            if (isDirty) dbDirtyIndicator.classList.remove('hidden');
            else dbDirtyIndicator.classList.add('hidden');
        }
        renderTabs();
    }

    function getColLetter(index) {
        return String.fromCharCode(65 + index);
    }

    function getSelectedCells() {
        return Array.from(gridBody.querySelectorAll('.cell-selected'));
    }

    const measurementCanvas = document.createElement('canvas');
    const measurementCtx = measurementCanvas.getContext('2d');

    function calculateTextWidth(text, font = '13px sans-serif') {
        measurementCtx.font = font;
        return measurementCtx.measureText(text).width;
    }

    function autoFitColumnWidth(colIndex) {
        const MIN_WIDTH = 80;
        const MAX_WIDTH = 350;
        const PADDING = 24;

        const cells = gridBody.querySelectorAll(`td[data-col="${colIndex}"]`);
        let maxMeasuredWidth = MIN_WIDTH;

        cells.forEach(td => {
            const text = td.innerText || '';
            if (text.length > 0) {
                const font = window.getComputedStyle(td).font;
                const textWidth = calculateTextWidth(text, font) + PADDING;
                if (textWidth > maxMeasuredWidth) maxMeasuredWidth = textWidth;
            }
        });

        const targetWidth = Math.min(Math.max(maxMeasuredWidth, MIN_WIDTH), MAX_WIDTH);
        const headerTh = gridHeader.querySelector(`th[data-col-idx="${colIndex}"]`);
        if (headerTh) {
            headerTh.style.width = `${targetWidth}px`;
            headerTh.style.minWidth = `${targetWidth}px`;
        }

        cells.forEach(td => {
            td.style.width = `${targetWidth}px`;
            td.style.minWidth = `${targetWidth}px`;
        });
    }

    function getTableBoundaries() {
        if (!activeTable || !tablesData[activeTable]) return { maxCol: 2, maxRow: 0 };
        const currentData = tablesData[activeTable];
        let maxCol = -1;

        for (let c = 0; c < TOTAL_COLS; c++) {
            if (currentData.columns[c] && currentData.columns[c].trim() !== '') maxCol = c;
        }

        currentData.rows.forEach(row => {
            if (row) {
                row.forEach((cellVal, colIdx) => {
                    if (cellVal && String(cellVal).trim() !== '' && colIdx > maxCol) maxCol = colIdx;
                });
            }
        });

        if (maxCol === -1) maxCol = 2;

        let maxRow = 0;
        for (let r = 0; r < currentData.rows.length; r++) {
            if (currentData.rows[r] && currentData.rows[r].some(val => val && String(val).trim() !== '')) {
                maxRow = r + 1;
            }
        }

        return { maxCol, maxRow };
    }

    function highlightRange(startRow, startCol, endRow, endCol) {
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        const minCol = Math.min(startCol, endCol);
        const maxCol = Math.max(startCol, endCol);

        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                const cell = gridBody.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
                if (cell) {
                    cell.classList.add('cell-selected');
                    if (r === minRow) cell.classList.add('sel-top');
                    if (r === maxRow) cell.classList.add('sel-bottom');
                    if (c === minCol) cell.classList.add('sel-left');
                    if (c === maxCol) cell.classList.add('sel-right');
                }
            }
        }
    }

    function clearSelections() {
        gridBody.querySelectorAll('.cell-selected').forEach(td => {
            td.classList.remove('cell-selected', 'sel-top', 'sel-bottom', 'sel-left', 'sel-right');
        });
    }

    function selectAllCells() {
        clearSelections();
        const bounds = getTableBoundaries();
        const startRowOffset = (currentPage - 1) * pageSize;
        highlightRange(startRowOffset + 1, 0, startRowOffset + bounds.maxRow, bounds.maxCol);
    }

    function collapseAllRows() {
        gridBody.querySelectorAll('tr.row-expanded').forEach(tr => tr.classList.remove('row-expanded'));
    }

    function updateCoordinateDisplay(row, col) {
        const displayBox = document.getElementById('cell-coordinate-display');
        if (displayBox) displayBox.innerText = `${getColLetter(col)}${row}`;
    }

    function sortActiveTable(colIdx) {
        if (!activeTable || !tablesData[activeTable]) return;

        const currentDir = currentSortState.get(colIdx) || 'none';

        if (currentDir === 'none') {
            currentSortState.set(colIdx, 'asc');
        } else if (currentDir === 'asc') {
            currentSortState.set(colIdx, 'desc');
        } else {
            currentSortState.delete(colIdx);
        }

        currentPage = 1;    
        loadPageData(activeTable, currentPage);
    }

    function focusAndSelectCell(row, col) {
        const targetCell = gridBody.querySelector(`td[data-row="${row}"][data-col="${col}"]`) ||
                           gridBody.querySelector(`td[data-row="${row}"][data-col="${col}"] .col-header-text`);

        if (targetCell) {
            clearSelections();
            const parentTd = targetCell.closest('td');
            if (parentTd) parentTd.classList.add('cell-selected', 'sel-top', 'sel-bottom', 'sel-left', 'sel-right');
            targetCell.focus();

            if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
                const range = document.createRange();
                range.selectNodeContents(targetCell);
                range.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
            updateCoordinateDisplay(row, col);
        }
    }

    function handleGridKeyboardNavigation(e, currentRow, currentCol) {
        const key = e.key;

        if (activeSearchQuery !== '' && searchMatches.length > 0) {
            if (key === 'ArrowDown' || key === 'ArrowRight') {
                e.preventDefault();
                if (currentMatchIndex < searchMatches.length - 1) {
                    currentMatchIndex++;
                    focusMatch(currentMatchIndex);
                }
                return;
            } else if (key === 'ArrowUp' || key === 'ArrowLeft') {
                e.preventDefault();
                if (currentMatchIndex > 0) {
                    currentMatchIndex--;
                    focusMatch(currentMatchIndex);
                }
                return;
            }
        }

        const startRowOffset = (currentPage - 1) * pageSize;
        const maxRowBoundary = startRowOffset + TOTAL_ROWS;

        if (key === 'Enter') {
            e.preventDefault();
            const targetRow = e.shiftKey ? Math.max(startRowOffset, currentRow - 1) : Math.min(maxRowBoundary, currentRow + 1);
            focusAndSelectCell(targetRow, currentCol);
            return;
        }

        if (key === 'Escape') {
            e.preventDefault();
            closeSearchModal();
            if (document.activeElement) document.activeElement.blur();
            clearSelections();
            return;
        }

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
            let newRow = currentRow;
            let newCol = currentCol;

            if (key === 'ArrowUp') newRow = Math.max(startRowOffset, currentRow - 1);
            else if (key === 'ArrowDown') newRow = Math.min(maxRowBoundary, currentRow + 1);
            else if (key === 'ArrowLeft') newCol = Math.max(0, currentCol - 1);
            else if (key === 'ArrowRight') newCol = Math.min(TOTAL_COLS - 1, currentCol + 1);

            if (newRow !== currentRow || newCol !== currentCol) {
                e.preventDefault();
                focusAndSelectCell(newRow, newCol);
            }
        }
    }

    function attachCellEvents(element, row, col) {
        element.addEventListener('focus', () => {
            cellEditSnapshot = cloneState(tablesData);
            collapseAllRows();
            const parentTr = element.closest('tr');
            if (parentTr) parentTr.classList.add('row-expanded');
            updateCoordinateDisplay(row, col);
        });

        element.addEventListener('blur', () => {
            const parentTr = element.closest('tr');
            if (parentTr) parentTr.classList.remove('row-expanded');
        });

        element.addEventListener('mousedown', () => {
            isMouseDown = true;
            startCell = { row, col };
            clearSelections();
            const parentTd = element.closest('td');
            if (parentTd) parentTd.classList.add('cell-selected', 'sel-top', 'sel-bottom', 'sel-left', 'sel-right');

            collapseAllRows();
            const parentTr = element.closest('tr');
            if (parentTr) parentTr.classList.add('row-expanded');
            updateCoordinateDisplay(row, col);
        });

        element.addEventListener('mouseover', () => {
            if (isMouseDown && startCell) {
                clearSelections();
                highlightRange(startCell.row, startCell.col, row, col);
                updateCoordinateDisplay(row, col);
            }
        });

        element.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) return;
            handleGridKeyboardNavigation(e, row, col);
        });

        element.addEventListener('input', (e) => {
            if (cellEditSnapshot) {
                undoStack.push(cellEditSnapshot);
                if (undoStack.length > MAX_HISTORY) undoStack.shift();
                redoStack = [];
                cellEditSnapshot = null;
                updateUndoRedoUI();
            }

            if (!activeTable || !tablesData[activeTable]) return;
            const currentData = tablesData[activeTable];
            const val = e.target.innerText;

            const startRowOffset = (currentPage - 1) * pageSize;
            const localRowIdx = row - startRowOffset - 1;

            if (row === 0) {
                currentData.columns[col] = (val.trim() !== '0') ? val : '';
            } else {
                if (!currentData.rows[localRowIdx]) currentData.rows[localRowIdx] = [];
                currentData.rows[localRowIdx][col] = val;
            }

            autoFitColumnWidth(col);
            setDirty(true);
        });
    }

    document.addEventListener('mouseup', () => { isMouseDown = false; });

    function handleCopy(isCut = false) {
        const selectedCells = getSelectedCells();
        if (selectedCells.length === 0) return;

        let minRow = Infinity, maxRow = -Infinity;
        let minCol = Infinity, maxCol = -Infinity;

        selectedCells.forEach(cell => {
            const r = parseInt(cell.dataset.row);
            const c = parseInt(cell.dataset.col);
            if (r < minRow) minRow = r;
            if (r > maxRow) maxRow = r;
            if (c < minCol) minCol = c;
            if (c > maxCol) maxCol = c;
        });

        const rowsData = [];
        if (isCut) saveState();

        const startRowOffset = (currentPage - 1) * pageSize;

        for (let r = minRow; r <= maxRow; r++) {
            const rowVals = [];
            const localRowIdx = r - startRowOffset - 1;

            for (let c = minCol; c <= maxCol; c++) {
                const cell = gridBody.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
                let rawText = cell ? cell.innerText.trim() : '';

                let cleanedVal = rawText
                    .replace(/[↕▲▼]/g, '')
                    .replace(/\r?\n|\r/g, '')
                    .trim();
                
                rowVals.push(cleanedVal);

                if (isCut && cell) {
                    cell.innerText = '';
                    const currentData = tablesData[activeTable];
                    if (r === 0) currentData.columns[c] = '';
                    else if (currentData.rows[localRowIdx]) currentData.rows[localRowIdx][c] = '';
                }
            }
            rowsData.push(rowVals.join('\t'));
        }

        navigator.clipboard.writeText(rowsData.join('\n'));

        if (isCut) {
            setDirty(true);
            syncActiveTableToBackend();
        }
    }

    async function handlePaste(e) {
        if (!activeTable || !tablesData[activeTable]) return;

        const clipboardData = e.clipboardData || window.clipboardData;
        const pastedText = clipboardData ? clipboardData.getData('Text') : '';
        if (!pastedText) return;

        e.preventDefault();

        const lines = pastedText.split(/\r?\n/).filter(line => line.length > 0);
        if (lines.length === 0) return;

        const pastedMatrix = lines.map(line => 
            line.split('\t').map(cell => cell.replace(/[↕▲▼]/g, '').trim())
        );

        const currentTable = tablesData[activeTable];
        const existingCols = (currentTable.columns || []).filter(c => c && c.trim() !== '');

        let dataToPaste = pastedMatrix;

        if (existingCols.length === 0) {
            const potentialHeaders = pastedMatrix[0];
            const isFirstRowHeader = potentialHeaders.some(h => isNaN(Number(h)) && h !== '');

            if (isFirstRowHeader) {
                saveState();
                currentTable.columns = potentialHeaders;
                dataToPaste = pastedMatrix.slice(1);
            }
        } else {
            const potentialHeaders = pastedMatrix[0];
            const exactHeaderMatch = potentialHeaders.length === existingCols.length &&
                potentialHeaders.every((h, idx) => h.toLowerCase() === existingCols[idx].toLowerCase());

            if (exactHeaderMatch) {
                dataToPaste = pastedMatrix.slice(1);
            }
        }

        if (dataToPaste.length === 0) return;

        saveState();

        const selectedCells = getSelectedCells();
        const startRowOffset = (currentPage - 1) * pageSize;
        let targetRow = startRowOffset + 1;
        let targetCol = 0;

        if (selectedCells.length > 0) {
            targetRow = parseInt(selectedCells[0].dataset.row, 10);
            targetCol = parseInt(selectedCells[0].dataset.col, 10);
            if (targetRow === 0) targetRow = startRowOffset + 1;
        }

        if (!currentTable.rows) currentTable.rows = [];

        dataToPaste.forEach((rowVals, rIdx) => {
            const r = targetRow + rIdx;
            const localRowIdx = r - startRowOffset - 1;

            if (localRowIdx >= TOTAL_ROWS) return;

            if (!currentTable.rows[localRowIdx]) {
                currentTable.rows[localRowIdx] = [];
            }

            rowVals.forEach((val, cIdx) => {
                const c = targetCol + cIdx;
                if (c >= TOTAL_COLS) return;

                currentTable.rows[localRowIdx][c] = val;
            });
        });

        setDirty(true);
        renderGrid();
        syncActiveTableToBackend();
    }

    function handleDelete() {
        const selectedCells = getSelectedCells();
        if (selectedCells.length === 0) return;

        if (typeof saveState === 'function') saveState();

        const currentData = tablesData[activeTable];
        const startRowOffset = (currentPage - 1) * pageSize;
        let isModified = false;

        selectedCells.forEach(cell => {
            const r = parseInt(cell.dataset.row);
            const c = parseInt(cell.dataset.col);

            cell.innerText = '';

            if (currentData) {
                if (r === 0) {
                    currentData.columns[c] = '';
                    isModified = true;
                } else {
                    const localRowIdx = r - startRowOffset - 1;
                    if (currentData.rows[localRowIdx]) {
                        currentData.rows[localRowIdx][c] = '';
                        isModified = true;
                    }
                }
            }
        });

        if (isModified) {
            setDirty(true);
            if (typeof syncActiveTableToBackend === 'function') {
                syncActiveTableToBackend();
            }
        }
    }
 

    async function sanitizeTablesData() {
        if (!activeTable || !tablesData[activeTable]) return;

        const table = tablesData[activeTable];
        if (!table || !Array.isArray(table.rows) || !Array.isArray(table.columns)) return;

        // 1. Filter out completely empty rows
        table.rows = table.rows.filter(row => 
            Array.isArray(row) && row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== '')
        );

        // 2. Identify active column indices (columns that have a header OR cell data)
        const activeColIndices = [];
        const maxCols = Math.max(table.columns.length, ...table.rows.map(r => (Array.isArray(r) ? r.length : 0)));

        for (let c = 0; c < maxCols; c++) {
            const colHeaderHasValue = table.columns[c] && String(table.columns[c]).trim() !== '';
            const colDataHasValue = table.rows.some(r => r[c] !== undefined && r[c] !== null && String(r[c]).trim() !== '');

            if (colHeaderHasValue || colDataHasValue) {
                activeColIndices.push(c);
            }
        }

        // 3. Re-index and prune empty column gaps
        table.columns = activeColIndices.map((cIdx, i) => {
            const header = table.columns[cIdx];
            return header && String(header).trim() !== '' ? String(header).trim() : `Column_${i + 1}`;
        });

        table.rows = table.rows.map(row => 
            activeColIndices.map(cIdx => (row[cIdx] !== undefined && row[cIdx] !== null ? row[cIdx] : ''))
        );

        // 4. AWAIT the sync back to backend staging
        if (typeof syncActiveTableToBackend === 'function') {
            await syncActiveTableToBackend();
        }
    }

    async function saveDatabase() {
        // 1. MUST await syncing current page edits to server first
        await sanitizeTablesData();

        let filepathVal = dbFilenameDisplay ? dbFilenameDisplay.textContent.trim() : 'database.db';
        if (!filepathVal) filepathVal = 'database.db';
        if (!filepathVal.endsWith('.db')) filepathVal = `${filepathVal}.db`;

        try {
            // Now /api/save receives a fully updated backend SQLite session
            const response = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filepath: filepathVal })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Save failed');
            }

            const blob = await response.blob();

            if (activeFileHandle && 'createWritable' in activeFileHandle) {
                const writable = await activeFileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
            } else {
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = filepathVal;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(downloadUrl);
            }

            if (dbFilenameDisplay) dbFilenameDisplay.textContent = filepathVal;
            hasBeenSavedBefore = true;
            setDirty(false);
            if (typeof renderTabs === 'function') renderTabs();
            if (typeof renderGrid === 'function') renderGrid();
        } catch (err) {
            if (typeof Dialog !== 'undefined' && Dialog.alert) {
                await Dialog.alert(`Save failed: ${err.message}`, 'Save Error');
            } else {
                alert(`Save failed: ${err.message}`);
            }
        }
    }

    async function handleSaveAs() {
        let defaultName = dbFilenameDisplay ? dbFilenameDisplay.textContent.trim() : 'database.db';
        if (!defaultName) defaultName = 'database.db';

        // 1. MUST await syncing active page edits first
        await sanitizeTablesData();

        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: defaultName,
                    types: [{
                        description: 'SQLite Database File (.db)',
                        accept: { 'application/x-sqlite3': ['.db'] }
                    }]
                });

                const response = await fetch('/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filepath: handle.name })
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.message || 'Save failed');
                }

                const blob = await response.blob();
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();

                activeFileHandle = handle;
                hasBeenSavedBefore = true;
                if (dbFilenameDisplay) dbFilenameDisplay.textContent = handle.name;

                setDirty(false);
                if (typeof renderTabs === 'function') renderTabs();
                if (typeof renderGrid === 'function') renderGrid();
            } catch (err) {
                if (err.name !== 'AbortError') {
                    if (typeof Dialog !== 'undefined' && Dialog.alert) {
                        await Dialog.alert(`Save As failed: ${err.message}`, 'Save Error');
                    } else {
                        alert(`Save As failed: ${err.message}`);
                    }
                }
            }
        } else {
            hasBeenSavedBefore = true;
            await saveDatabase();
        }
    }

    async function exportXlsx() {
        syncActiveTableToBackend();
        try {
            const response = await fetch('/api/export_xlsx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tables: tablesData })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Export failed');
            }

            const blob = await response.blob();

            const filename = dbFilenameDisplay && dbFilenameDisplay.textContent
                ? dbFilenameDisplay.textContent.replace(/\.[^/.]+$/, "") + '.xlsx'
                : 'exported_database.xlsx';

            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);
        } catch (err) {
            await Dialog.alert(`Export failed: ${err.message}`, 'Export Error');
        }
    }

    function handleAddTable() {
        saveState();
        const existingKeys = Object.keys(tablesData);
        let newIndex = existingKeys.length + 1;
        let newTableName = `Table${newIndex}`;

        while (tablesData[newTableName]) {
            newIndex++;
            newTableName = `Table${newIndex}`;
        }

        tablesData[newTableName] = {
            columns: ['Column1', 'Column2'],
            rows: []
        };

        activeTable = newTableName;
        setDirty(true);
        renderTabs();
        renderGrid();
        syncActiveTableToBackend();
    }

    async function handleRenameTable(oldName) {
        const newName = await Dialog.prompt('Enter new table name:', oldName, 'Rename Table');
        if (!newName || newName.trim() === '' || newName === oldName) return;

        const sanitizedName = newName.trim();
        if (tablesData[sanitizedName]) {
            await Dialog.alert('A table with that name already exists.', 'Rename Error');
            return;
        }

        saveState();
        tablesData[sanitizedName] = tablesData[oldName];
        delete tablesData[oldName];

        if (activeTable === oldName) activeTable = sanitizedName;

        setDirty(true);
        renderTabs();
        renderGrid();

        fetch('/api/rename_table', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_name: oldName, new_name: sanitizedName })
        }).catch(err => console.error('Rename table error:', err));
    }

    async function handleDeleteTable(tableName) {
        const tableKeys = Object.keys(tablesData);
        if (tableKeys.length <= 1) {
            await Dialog.alert('Cannot delete the only remaining table.', 'Delete Error');
            return;
        }

        const confirmed = await Dialog.confirm(`Are you sure you want to delete table "${tableName}"?`, 'Delete Table');
        if (!confirmed) return;

        saveState();
        delete tablesData[tableName];

        if (activeTable === tableName) {
            activeTable = Object.keys(tablesData)[0];
        }

        setDirty(true);
        renderTabs();
        renderGrid();

        try {
            await fetch('/api/delete_table', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table_name: tableName })
            });
        } catch (err) {
            console.error('Delete table error:', err);
        }
    }

    function attachEventListeners() {
        if (btnUndo) btnUndo.addEventListener('click', undo);
        if (btnRedo) btnRedo.addEventListener('click', redo);

        if (btnFiles && fileSidebar) btnFiles.addEventListener('click', () => fileSidebar.classList.toggle('hidden'));
        if (btnCloseFiles && fileSidebar) btnCloseFiles.addEventListener('click', () => fileSidebar.classList.add('hidden'));

        if (btnAiToggle && aiSidebar) btnAiToggle.addEventListener('click', () => aiSidebar.classList.toggle('hidden'));
        if (btnCloseAi && aiSidebar) btnCloseAi.addEventListener('click', () => aiSidebar.classList.add('hidden'));

        if (menuRenameTable) {
            menuRenameTable.addEventListener('click', () => {
                if (contextMenu) contextMenu.classList.add('hidden');
                if (contextTargetTab) handleRenameTable(contextTargetTab);
            });
        }

        if (menuDeleteTable) {
            menuDeleteTable.addEventListener('click', () => {
                if (contextMenu) contextMenu.classList.add('hidden');
                if (contextTargetTab) handleDeleteTable(contextTargetTab);
            });
        }

        document.addEventListener('click', (e) => {
            if (contextMenu && !contextMenu.contains(e.target)) contextMenu.classList.add('hidden');
        });

        if (btnAddTable) btnAddTable.addEventListener('click', handleAddTable);

        if (menuImport) {
            menuImport.addEventListener('click', () => {
                if (fileSidebar) fileSidebar.classList.add('hidden');
                handleFileImport();
            });
        }

        if (menuOpen) {
            menuOpen.addEventListener('click', () => {
                if (fileSidebar) fileSidebar.classList.add('hidden');
                handleFileOpen();
            });
        }

        if (menuNew) {
            menuNew.addEventListener('click', async () => {
                const shouldProceed = await confirmUnsavedGuard('creating a new file');
                if (!shouldProceed) return;

                await fetch('/api/new', { method: 'POST' });
                initDefaultTable(); 
                if (dbFilenameDisplay) dbFilenameDisplay.textContent = 'Untitled.db';
                activeFileHandle = null;
                hasBeenSavedBefore = false;
                currentSortState.clear();
                resetHistory();
                setDirty(false);
                renderTabs();
                renderGrid();
                if (fileSidebar) fileSidebar.classList.add('hidden');
            });
        }

        if (menuSaveAs) {
            menuSaveAs.addEventListener('click', () => {
                if (fileSidebar) fileSidebar.classList.add('hidden');
                handleSaveAs();
            });
        }

        if (menuSave) {
            menuSave.addEventListener('click', () => {
                saveDatabase();
                if (fileSidebar) fileSidebar.classList.add('hidden');
            });
        }

        if (btnQuickSave) btnQuickSave.addEventListener('click', saveDatabase);

        if (menuExport) {
            menuExport.addEventListener('click', () => {
                exportXlsx();
                if (fileSidebar) fileSidebar.classList.add('hidden');
            });
        }

        if (searchScopeBtn) {
            searchScopeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openSearchModal();
            });
        }

        if (searchOverlay) {
            searchOverlay.addEventListener('click', (e) => {
                if (e.target === searchOverlay) closeSearchModal();
            });
        }

        if (btnCloseSearch) btnCloseSearch.addEventListener('click', closeSearchModal);

        if (chkAllTables) {
            chkAllTables.addEventListener('change', (e) => {
                searchTablesList.querySelectorAll('.chk-table-item').forEach(chk => chk.checked = e.target.checked);
                updateColumnsChecklist();
                executeSearch();
            });
        }

        if (chkAllCols) {
            chkAllCols.addEventListener('change', (e) => {
                if (!userSelectedCols) userSelectedCols = new Set();
                searchColsList.querySelectorAll('.chk-col-item').forEach(chk => {
                    chk.checked = e.target.checked;
                    if (chk.checked) userSelectedCols.add(chk.value);
                    else userSelectedCols.delete(chk.value);
                });
                syncAllColsCheckbox();
                executeSearch();
            });
        }

        if (chkMatchCase) chkMatchCase.addEventListener('change', executeSearch);
        if (chkMatchWord) chkMatchWord.addEventListener('change', executeSearch);
        if (searchInput) searchInput.addEventListener('input', executeSearch);

        if (btnFindNext) {
            btnFindNext.addEventListener('click', () => {
                if (currentMatchIndex < searchMatches.length - 1) {
                    currentMatchIndex++;
                    focusMatch(currentMatchIndex);
                }
            });
        }

        if (btnFindPrev) {
            btnFindPrev.addEventListener('click', () => {
                if (currentMatchIndex > 0) {
                    currentMatchIndex--;
                    focusMatch(currentMatchIndex);
                }
            });
        }

        // Terminal Log Listeners
        if (logsToggleBtn) {
            logsToggleBtn.addEventListener("click", () => {
                logsModal.classList.remove("hidden");
                fetchLogs();
            });
        }

        if (logsCloseBtn) {
            logsCloseBtn.addEventListener("click", () => {
                logsModal.classList.add("hidden");
                logsWindow.classList.remove("maximized");
            });
        }

        if (logsMaximizeBtn) {
            logsMaximizeBtn.addEventListener("click", () => {
                logsWindow.classList.toggle("maximized");
            });
        }

        if (logsModal) {
            logsModal.addEventListener("click", (e) => {
                if (e.target === logsModal) {
                    logsModal.classList.add("hidden");
                    logsWindow.classList.remove("maximized");
                }
            });
        }

        // Pagination Controls
        const btnFirst = document.getElementById('btn-first-page');
        const btnPrev = document.getElementById('btn-prev-page');
        const btnNext = document.getElementById('btn-next-page');
        const btnLast = document.getElementById('btn-last-page');

        if (btnFirst) {
            btnFirst.addEventListener('click', () => {
                if (currentPage > 1) loadPageData(activeTable, 1);
            });
        }

        if (btnPrev) {
            btnPrev.addEventListener('click', () => {
                if (currentPage > 1) loadPageData(activeTable, currentPage - 1);
            });
        }

        if (btnNext) {
            btnNext.addEventListener('click', () => {
                if (currentPage < totalPages) loadPageData(activeTable, currentPage + 1);
            });
        }

        if (btnLast) {
            btnLast.addEventListener('click', () => {
                if (currentPage < totalPages) loadPageData(activeTable, totalPages);
            });
        }

        // Global Shortcuts & Key Handlers
        document.addEventListener('keydown', (e) => {
            const activeEl = document.activeElement;
            const isEditingInput = activeEl && (
                activeEl.tagName === 'INPUT' || 
                activeEl.tagName === 'TEXTAREA' || 
                activeEl.isContentEditable
            );

            if (!e.ctrlKey && !e.metaKey && !e.altKey && !isEditingInput && activeSearchQuery.trim() !== '') {
                const key = e.key.toLowerCase();
                if (key === 'b') {
                    e.preventDefault();
                    if (currentMatchIndex > 0) {
                        currentMatchIndex--;
                        focusMatch(currentMatchIndex);
                    }
                    return;
                } else if (key === 'n') {
                    e.preventDefault();
                    if (currentMatchIndex < searchMatches.length - 1) {
                        currentMatchIndex++;
                        focusMatch(currentMatchIndex);
                    }
                    return;
                }
            }

            if (e.key === 'Delete' || (e.key === 'Backspace' && !isEditingInput)) {
                const selectedCells = getSelectedCells();
                if (selectedCells && selectedCells.length > 0) {
                    e.preventDefault();
                    handleDelete();
                    return;
                }
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                openSearchModal();
                return;
            }

            if (e.ctrlKey || e.metaKey) {
                const key = e.key.toLowerCase();
                if (key === 'z') {
                    e.preventDefault();
                    if (e.shiftKey) redo();
                    else undo();
                } else if (key === 'y') {
                    e.preventDefault();
                    redo();
                } else if (key === 's') {
                    e.preventDefault();
                    if (e.shiftKey) handleSaveAs();
                    else saveDatabase();
                } else if (key === 'a' && !isEditingInput) {
                    e.preventDefault();
                    selectAllCells();
                } else if (key === 'c' && !isEditingInput) {
                    handleCopy(false);
                } else if (key === 'x' && !isEditingInput) {
                    handleCopy(true);
                }
            }
        });

        document.addEventListener('paste', handlePaste);

        window.addEventListener('beforeunload', (e) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    init();
});
