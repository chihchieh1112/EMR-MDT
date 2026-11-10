# EMR · Smart MDT demo（純前端）

| | |
|---|---|
| 建立 | 2026-11-10（P0 骨架與品牌） |
| 來源 | Smart Ward 原型 `C:\Users\hp\Downloads\vietnam\德國EMR_MDT\product\畫面\`（內容到 2026-11-08）整個複製進來；logo、配色取自 46 張行銷畫面；規劃見上一層 `demo規劃建議_v0.2_2026-11-10.md` |
| 性質 | 純前端單頁應用：沒有伺服器、沒有網路呼叫（CSP `connect-src 'none'`），資料存瀏覽器 localStorage（鍵 `icu-day-v2`） |
| 原則 | 原型的檔案盡量不改，demo 的差異集中在 `assets/demo-*.*`；非改不可的地方用 `globalThis.DEMO` 判斷，沒有 DEMO 時行為同原型 |

## 怎麼開

- 本機預覽：Claude 桌面 app 的 launch `emr-mdt-demo`（`python -m http.server 8773 --directory demo`），開 `http://127.0.0.1:8773/index.html`；登入頁 `login.html`。
- 直接雙擊 `index.html`（`file://`）也能開；儲存依瀏覽器而異，頂列「Demo data」會多一句提示。
- 身分由網址 `#view=home&actor=<帳號鍵>` 決定（原型設計，沒有登入守門）；帳號選單可「Switch role」。
- 語言：右上 中文／EN／VI；英文是正本，中越由 `assets/i18n-dict.js`＋`assets/demo-dict.js` 翻譯。網址 `?lang=en` 可指定。

## P0 改了什麼

| 檔案 | 改動 |
|---|---|
| `assets/demo-config.js`（新） | `globalThis.DEMO`：品牌文字、logo 路徑、`hideHis`、`neutralForms` 旗標 |
| `assets/demo-dict.js`（新） | demo 新增英文字串的中文與越南文；在 `i18n-dict.js` 之後、`i18n.js` 之前載入 |
| `assets/demo-brand.css`（新） | 不分層的色票覆寫（主綠 #148d68、側欄 #123e34、萊姆 #94c83d、藍 #007eaa、底 #f3f7f5、字 #223b37、線 #dce7e1）、側欄 lockup 與登入面板的 logo 樣式 |
| `assets/brand-icon.svg`、`assets/icon.png`（新） | 醫盾 logo（46 張畫面）、favicon（簡報 assets） |
| `assets/workspace.js` | 側欄 lockup 改 logo＋「EMR · Smart MDT／Demo Hospital · Oncology」；頁名與 eyebrow 的預設字串改讀 DEMO |
| `assets/app.js` | `document.title` 前綴；`hisQueue`／`hisBatchDemo` 在 `DEMO.hideHis` 時不顯示；Demo data 面板加兩句聲明（資料全部虛構；MDT 寫入僅供示範、非一期範圍） |
| `index.html`、`login.html`、`design-system.html` | 標題、favicon、載入 demo-config／demo-dict／demo-brand；登入頁左側文案改成 EMR + MDT demo |
| `..\.claude\launch.json` | 新增 `emr-mdt-demo`（8773） |

沒動：`store.js`、`workflow.js`、`mdt.js`、`catalog.js`、`staff-seed.js`、所有 `patient/*.js`、`i18n-dict.js`。

## P1（2026-11-10）英文腫瘤病房資料集

| 檔案 | 內容 |
|---|---|
| `assets/catalog.js`（取代） | 英文示範目錄 74 KB、302 筆：科別 18、途徑 13、單位 16、治療結果 7、ICD-10 子集 50、藥品 96（化療、內分泌、止吐、支持、止痛、心血管、抗感染、腸胃、代謝、輸液）、服務 86（檢驗 39 含病理與基因、檢查 18、處置與照護 30）、飲食 6、衛材 6、外院 4。由 `..\_build\build_catalog.py` 產生；原型的越南 B 目錄不再載入 |
| `assets/staff-seed.js`（重寫） | 24 個英文帳號（見 `..\demo規劃建議_v0.2` 第 3 節）；新增身分 `allied`（營養、藥學、復健、社工，P1 唯讀）與夜班護理師 Nora Quinn；儲存鍵改讀 `DEMO.storageKey` |
| `assets/seed-oncology.js`（新） | `root.ICUDemoSeed`：12 位病人（A01–A12）、照護關係、生命徵象、報告（Margaret 四個抽血日、病理與 IHC、CT、骨掃描、ECG、心臟超音波待回）、醫囑與給藥（FOLFOX、AC、抗生素…）、照會 3 筆、病程 SOAP 8 筆、前一班 7 筆 ISBAR 交班、工作 6 件、手術紀錄 1 份、科別設定、示範時鐘 2026-11-04 09:40；另給 clinical 的 `labDefs/labMeta`、taxonomy 的科別與常用清單、orders 的 4 個主套 13 個組套 |
| `store.js` | `seed()` 有 `ICUDemoSeed` 就用它；`upgradePatients` 不補原型病人；`createStore` 預設鍵讀 `DEMO.storageKey`（`emr-mdt-demo-v1`） |
| `clinical.js` | `DEMO_NOW` 讀資料集（2026-11-04T19:00）、班別時間窗改依示範日計算、`enrich` 對 demo 資料集不加原型合成歷史、`labDefs/labMeta` 合併資料集 |
| `workflow.js`、`order-taxonomy.js`、`patient/orders.js` | 科別設定、檢查群組名、科別清單、常用與組套改讀資料集 |
| `app.js` | 預設登入者 `DEMO.defaultActor`（mercer）、找不到病人時退回第一位；allied 的頭像與身分說明 |
| `workspace.js` | `view=mdt` 在 `DEMO.mdtPlaceholder` 時顯示「重建中」說明頁（原型 MDT 只看版引用兒科病人，P2 重建） |
| `maintenance.js` | 身分標籤與篩選加 Allied health |
| `index.html`、`login.html` | 載入 `seed-oncology.js`（catalog 之後、clinical 之前）；資源網址加 `?v=p1` 防快取 |
| `..\_build\serve.py` | 本機預覽伺服器（`Cache-Control: no-store`），launch `emr-mdt-demo` 改用它 |
| `..\_build\smoke_test.cjs` | node 煙霧測試：建 store、讀狀態、照會／量測／給藥／病程寫入全過 |

登入身分（網址 `actor=`）：`mercer` 主治、`grant` 主治、`brooks` 住院醫師／秘書、`sutton` 夜班醫師、`hartley` 科主任、`ashford` 乳房外科主任／主席、`kemp`、`finch` 放腫、`price` 影像、`webb` 病理、`cole` 核醫、`hale` 整形、`marsh` 心臟內科會診、`carter`／`fletcher`／`shaw`／`quinn` 護理師、`whitfield` 協調人、`blake` 護理長、`morgan`／`lowry`／`wheeler`／`booth` 職類、`admin` 管理者。

已知未做（留到 P2）：BSA（mg/m²）劑量模式與劑量檢核（目前化療醫囑的劑量以文字寫出 mg/m² 換算）；門診 MDT 個案（Eleanor Whitby、Patricia Lowe）與上週追蹤個案只在 MDT 模組出現；A06 的四張職類照會（P3）；列印標題的越南表單代碼；總覽「Hospital course」仍有原型依入院來源產生的通用事件列。

瀏覽器若還看到舊資料：Demo data → Restart demo，或在 DevTools 清掉 localStorage 的 `emr-mdt-demo-v1`。

## P2（2026-11-10）MDT 主線

| 檔案 | 內容 |
|---|---|
| `assets/seed-mdt.js`（新） | 包住 `ICUDemoSeed.state()`，多出 `state.mdt`：4 個團隊（乳癌／肺癌／肝癌／大腸直腸癌，成員用帳號鍵）、會期（乳癌 W43 10-28 已結論、W44 11-04 14:00 本週、W45 開放；其他團隊各 1–2 場）、提案 11 件（主角 Margaret 的草稿 `MDT-1103-06` 由照會 `CS-1102-04` 產生；本週另 4 案含 2 位門診 Eleanor Whitby／Patricia Lowe；上週 4 案已結論；肺癌 2 案）、已鎖定紀錄 6 份、交接任務 15 件（含 A12 放療評估逾期）、儀表板示範數字、示範事件（心臟超音波回報 LVEF 60%） |
| `assets/mdt-core.js`（新） | 規則層：齊備檢核 8 項（病理、生物標記、分期、影像、基準檢驗、體能、心臟功能、病人意願）即時讀 reports／observations／proposal；既往卡；B.2 摘要建議文；指標；我的 MDT 待辦；權限 `guard()`（提案限可開醫囑的醫師；逾截止確認限協調人／秘書／主席；紀錄限秘書與主席；鎖定限主席；任務限負責人或其科別；意見本人確認）；寫入 `handle()`：`mdtPropose`／`mdtWithdraw`／`mdtWishesSave`／`mdtProposalConfirm`／`mdtAttendanceReply`／`mdtAttendanceMark`／`mdtSessionStart`／`mdtSessionConclude`／`mdtOpinionSave`／`mdtOpinionConfirm`／`mdtConclusionSave`／`mdtPlanSave`／`mdtRecordLock`（鎖定 → 產生任務、摘錄寫進病程紀錄 `N-MDT-…`）／`mdtRecordRevise`／`mdtTaskAccept`／`mdtTaskComplete`／`mdtTaskUnable`／`mdtRepropose`／`mdtDemoEvent`（示範時鐘跳轉、報告回報）；`after()`：帶 `mdtSource` 的 `catalogOrder` 讓任務變「已採納開單」，給藥完成後顯示「已開始」 |
| `assets/mdt-ui.js`（新） | 畫面：本週議程（21／21b：團隊 chips、會期卡、出席回覆、開會／結束、KPI、篩選、議程表、上週結論追蹤）、團隊與會期（20）、歷次會議、交接追蹤（25／25b：狀態流程、接收、依結論開單、完成、無法執行、再提案、操作紀錄）、儀表板（26：即時＋示範數字）、個案摘要包（22：8 項卡片＋既往卡＋病人意願表單＋快照）、討論與結論（23：A 出席、B.1 資料版本、B.2／B.4 表單、B.3 逐人意見與本人確認、B.4 處置計畫 7 欄、主席鎖定檢核、修訂版）、列印（24：A4「Multidisciplinary team meeting record」或會前摘要包）、提案頁（09p：團隊依 ICD 建議、會期與截止、問題由照會帶入、齊備預覽、前次結論）；EMR 入口：總覽 MDT 卡、置頂列「MDT」鈕、照會卡「Propose to team meeting (MDT)」、我的待辦 MDT 區塊；`afterRun` 決定提示訊息與跳頁 |
| `assets/mdt.css`（新） | demo 新元件樣式（齊備條、意見卡、處置計畫表、鎖定框、入口卡、待辦清單、列印），其餘沿用 app.css 既有 `.mdt-*` |
| `store.js` | dispatch：`mdt*` 動作跳過病人檢查、`default` 轉給 `ICUMdtCore.handle`、動作後呼叫 `after`；`catalogOrder` 記 `mdtSource` 並檢查任務屬於同一病人；**BSA 劑量模式**（`doseMode=bsa`：每 m² × 體表面積，Mosteller，記 `dosePerBsa`） |
| `workflow.js` | `guard` 對 `mdt*` 動作改呼叫 `ICUMdtCore.guard` |
| `master-schema.js` | 新增 `bodySurface(state, pid, day)`（最近身高＋劑量體重） |
| `patient/orders.js` | 劑量輸入多「Per m² (BSA)」（有身高體重且單位相容時預設）；體重列加 BSA；醫囑明細顯示每 m² 換算與 MDT 來源；隱藏欄位 `mdtSource`；整批生效時間預設示範時鐘；抗腫瘤藥（ATC L01）沒有維護頻率時排程預設「單次」 |
| `app.js` | `syncPerKg` 支援 bsa 模式；`run()` 之後呼叫 `ICUMdtDemo.afterRun`；路由新增 `mdtSource`、`mdtTab` 多 pack／record／propose、`mdtTeam` 讀 `ICUMdtCore.teamKeys()`、`mdtFilter` 多 mine／dept |
| `workspace.js` | `mdt(c)` 改用 `ICUMdtDemo.render`；置頂列、照會卡、我的待辦接上入口；`switchReset` 加 `mdtSource`／`mdtCase` |
| `patient/overview.js` | 主欄最上面插入 MDT 狀態卡 |
| `i18n.js`、`demo-config.js`、`demo-dict.js` | 語言只開 EN／中文、預設英文（`DEMO.langs`／`defaultLang`）；MDT 字串中文；儲存鍵改 `emr-mdt-demo-v2`；`mdtPlaceholder=false` |
| `catalog.js`（重生） | 藥品的開立單位改為含量單位（mg／g／mcg…），包裝單位另存 `packUnit`，每公斤／每 m² 模式才開得了 |
| `index.html` | 載入 `seed-mdt.js`（seed-oncology 之後）、`mdt-core.js`（store 之後）、`mdt-ui.js`（mdt.js 之後）、`mdt.css`；資源網址 `?v=p2` |
| `..\_build\smoke_test.cjs` | 加 MDT 主線：提案送出 → 協調人確認 → 意願 → 開會 → 結論／意見／計畫 → 主席鎖定（任務 3、摘錄病歷）→ 接收 → 示範事件（echo 8/8）→ 帶 MDT 來源的 BSA 開單（60 mg/m² × 1.60 = 96 mg）→ 給藥後「已開始」→ 完成／再提案／修訂版；權限拒絕 6 項；全過 |

**14 步故事線（瀏覽器驗證 2026-11-10）**：`actor=mercer` 總覽 A03 Margaret Ellis（MDT 卡：草稿、6/8 缺心臟功能與病人意願）→ 照會頁 CS-1102-04 已採納 →「Open MDT proposal draft」→ 提案頁（乳癌團隊、W44、問題帶入）→ 送出 → 議程第 1 案（逾截止待協調人）→ `whitfield` Confirm for agenda → `mercer` 摘要包填病人意願 7/8 → `brooks` Demo controls 跳到 14:00、Start the meeting → 紀錄頁：B.2 帶入、B.4 結論、代填 Ashford／Mercer 意見、處置計畫 3 列 → `ashford` 確認意見、Confirm and lock v1（任務 3、摘錄 `N-MDT-P03-1104-01` 進病程）→ `finch` 接收任務 2 → `mercer` 接收任務 1、Order per conclusion → 開立頁搜尋 doxorubicin、每 m² 60 → 96 mg（BSA 1.60）、單次、確認 → 醫囑明細有「Team meeting (MDT) conclusion source」與每 m² 換算 → 任務 1「已採納開單」→ 儀表板／列印預覽。示範事件「Receive echo report」讓 8/8。

已知未做（P3／P4）：會前各職類預填（22b／22c／23b 的帶入）、職類照會與第二條路（Harold Whitmore）、個案會議／家庭會議、設定頁唯讀展示、每頁回饋面板與導覽模式、zip 交付；越南文 MDT 字串。

## P3（2026-11-10）選配與第二條路

| 檔案 | 內容 |
|---|---|
| `assets/seed-care.js`（新） | 再包一層 `ICUDemoSeed.state()`：`mdt.rules`（召開提示 ≥3、固定時段、主題代碼、召開原因／目標／類別、不召開原因、五個會議層級、簽章設定）、`mdt.disciplines`（營養／臨床藥學／復健／社工四個職類的照會範本：開單勾選項、自動帶入、回覆欄位、歸檔與簽章、版本）、`mdt.refs` 11 張職類照會（Harold A06 的 RF-1103-01～04 照正典時間線；Margaret 的營養照會待接案；Peter Linton 追蹤；Dorothy Palmer 三張已在議程→不提示；Helen Barlow 兩張→決定暫不召開）、`mdt.conferences` 6 件（A04 已排定、A11 紀錄待主席確認、A09 家庭會議已完成、A12 兩次院內會診已結論、A10 暫不召開）、`mdt.prefills` 乳癌 W44 第 1 案的 6 份預填＋三題問題＋邀請名單（影像科未填→demo 現場填；核醫未填）、議程第 6 案 Dorothy Palmer、示範時鐘跳轉點 |
| `assets/mdt-core.js` | 擴充：`owns()` 含 `ref*`／`case*`／`family*`；查詢（職類對應、科主任／協調人／秘書、會議層級 `levelFor`、召開提示 `prompt`、預填統計 `prefillStats`、回覆摘要、字詞差異 `wordDiff`）；動作：`mdtPrefillSave`／`mdtPrefillRemind`、`refRequest`／`refAddQuestion`／`refPickUp`／`refInterim`／`refReply`／`refDecide`、`caseDecide`／`caseApprove`／`caseSchedule`／`caseAttendanceMark`／`caseOpinionSave`／`caseOpinionConfirm`／`caseRecordSave`／`casePlanSave`／`caseRecordSend`／`caseRecordLock`（鎖定 → 任務、摘錄進病程、接續家庭會議自動排程）、`familyMeetingCreate`／`familyMeetingSave`／`familyMeetingSign`（家屬代表＋主治兩個必簽齊 → 完成、摘錄、待辦併入任務）；`after()` 帶 `refSource` 的開單回寫照會「已採納開單」；預填送出後帶進 B.3；我的待辦加職類回覆待決定、待核准、待排程、待確認紀錄、未送出預填、職類待接案 |
| `assets/mdt-ui-p3.js`（新） | MDT 分頁「Case meetings」（30）、召開判斷（29，層級由系統判定）、個案會議紀錄／院內會診紀錄（31／10，A、B.1–B.4、附錄、簽名；帶入的照會回覆可確認或修改後確認，差異用 ins／del 標示）、家庭會議紀錄（32，出席、說明、意見、共識、待辦、依角色簽名）、會前預填總表（22b，送出自己的才看他科）與本人填寫（22c）；Consults & care 分頁改六個固定用詞：Specialist consult／Allied-health consult（09b 範本開單＋系統帶入）／Team overview（09d 召開提示、照會卡與主治決定、時間軸）／Multi-physician consultation（唯讀清單）；職類身分的 My to-dos＝該職類工作清單（09c，接案、初評與註記、依範本回覆並簽名）；維護設定唯讀分頁「Consult forms」（19b）與「Levels & signatures」（19c）；儀表板底部 roadmap 卡（AI 輔助、遠距 MDT、自動排入與 PACS 只列為 roadmap） |
| `assets/mdt-ui.js` | 分頁加 Case meetings；B.3 支援預填帶入、修改差異與「Confirm pre-fill」；B.2 會前立場摘要；任務卡支援個案會議任務；待辦連結；`afterRun` 委派；輸出 helpers 給 P3 模組 |
| `workspace.js`、`app.js`、`store.js`、`patient/orders.js` | Consults & care 子分頁與 `careWork` 值、職類身分的 to-dos、設定分頁掛鉤；路由新增 `mdtConf`／`mdtRef`／`refDisc`／`refSource`、`mdtTab`／`mdtFilter`／`tab` 白名單；`run()` 的 MDT 訊息掛鉤擴到 `ref*`／`case*`／`family*`；醫囑可帶 `refSource`（開立頁隱藏欄、明細顯示「Allied-health consult source」） |
| `seed-oncology.js` | Harold 的 ONS／物理治療／助行器醫囑補 `refSource` 與採納時間 |
| `demo-config.js`、`demo-dict.js`、`mdt.css`、`index.html` | 儲存鍵 `emr-mdt-demo-v3`、版本 P3；P3 中文字串；樣式；載入 `seed-care.js`（seed-mdt 之後）與 `mdt-ui-p3.js`（mdt-ui 之後）；資源 `?v=p3` |
| `..\_build\smoke_test.cjs` | 加 P3：預填送出／統計／提醒／非成員拒絕、B.3 帶入與差異；第二條路：接案→回覆→主治知悉、社工完成回覆、同職類重複開單拒絕、召開申請（層級 dept、9 位與會）→科主任核准→護理長排程→秘書紀錄（帶入 4 份回覆）→主席鎖定（任務、摘錄、家庭會議自動排程）→家庭會議儲存→兩個必簽→完成；暫不召開紀錄；權限拒絕 7 項；全過 |

**第二條路（瀏覽器驗證 2026-11-10）**：`actor=mercer` A06 Harold Whitmore → Consults & care › Team overview（召開提示：4 張職類照會 ≥ 3、社工標困難出院）→ Start case conference（29：層級科內、科主任核准、九位與會）→ `hartley` Approve → `blake` 排程 11-05 07:50 並送邀請 → `brooks` 紀錄：B.1 帶入、B.3 帶入三份職類回覆、B.4 結論、處置計畫、送主席 → `hartley` Confirm and lock（2 件任務、摘錄 `N-CC-P06-…` 進病程、家庭會議自動排 13:30）→ `mercer` 家庭會議：出席名單自動帶入（病人、配偶、兒子、主治、社工、護理長）、說明引用結論、共識與決定、待辦 2 件 → 家屬代表簡訊確認、主治電子簽 → 完成 2/2、摘錄 `N-FM-P06-…`、待辦併入任務追蹤。預填：`price` 在 22c 送出 → 總表 7/8 → 紀錄 B.3 帶入。`booth` 的 My to-dos＝社工照會工作清單（RF-1103-04 處理中，可完成回覆）。

已知未做（P4）：每頁回饋面板、導覽模式、zip、一頁操作說明；越南文 MDT 字串；院內會診的「申請」表單（demo 只展示紀錄）。

## P4（2026-11-10）收尾

| 檔案 | 內容 |
|---|---|
| `assets/demo-feedback.js`（新） | 右下角「Feedback」浮動面板：對目前這一頁標記 Fits our workflow／Needs change／Not needed 並留意見；每頁保留一個判斷（再存覆蓋）；「All feedback」列表、Export JSON／CSV（下載）、Copy as text（剪貼簿＋顯示文字框）、Clear all。存 localStorage `emr-mdt-feedback-v1`，與臨床示範資料分開；匯出只含判斷與意見。頁面識別＝view＋子分頁（mdtTab／careWork／tab）＋個案或照會編號 |
| `assets/demo-tour.js`（新） | 左下角「Guided tour」面板：A 線（團隊會議 MDT · Margaret Ellis，14 步）、B 線（個案跨團隊會議 · Harold Whitmore，9 步）；每步寫切換誰、到哪一頁、按什麼，「Go to this step」直接帶到該頁與該身分；Previous／Next；進度存 `emr-mdt-tour-v1`；網址 `?tour=1` 自動展開；附「Guide (one page)」連結與「Restart demo data」（只清示範狀態，回饋保留）。步驟文字中英文內建，面板標籤走字典 |
| `assets/demo-tools.css`（新） | 兩個面板的樣式；列印隱藏；窄螢幕上下錯開 |
| `guide.html`（新） | 一頁操作說明（EN＋中文並列，純靜態、無 script）：開啟方式、身分表、A／B 兩線逐步、六個固定用詞、示範控制、限制、回饋匯出；兩顆按鈕直接開導覽 |
| `login.html`、`index.html`、`demo-config.js`、`demo-dict.js` | 登入頁加「One-page guide」與「Start guided tour」連結；載入 `demo-tools.css`、`demo-feedback.js`、`demo-tour.js`（app.js 之後）；資源 `?v=p4`；版本 P4；面板中文字串 |

**交付**：`..\EMR整合MDT_demo_P4_2026-11-10.zip`（整個 `demo\` 資料夾）。解壓後雙擊 `index.html`（或 `guide.html` 看說明）即可；不需要伺服器與網路。

**GitHub Pages（2026-11-10）**：公開 repo `https://github.com/chihchieh1112/EMR-MDT`（分支 main，內容＝`demo\` 全部＋`.nojekyll`＋`README.md`；工作副本在 `..\_github\EMR-MDT\`，由 `demo\` 複製而來，更新時重新複製再 commit／push）。三個 html 加了 `<meta name="robots" content="noindex,nofollow">`，網址不會被搜尋引擎收錄，但知道網址的人都能開。Pages 啟用後網址：`https://chihchieh1112.github.io/EMR-MDT/`（導覽入口 `index.html?tour=1`、說明 `guide.html`）。

未做（可選）：5 分鐘操作影片（可用 `operation-demo-video` skill 以這些畫面製作）；越南文 MDT 字串。

## 下一步

- 收客戶回饋（匯出的 JSON／CSV）後決定 P5：依判斷結果調整畫面與流程。
- 需要時用 operation-demo-video skill 做操作影片。
