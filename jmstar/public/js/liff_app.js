(function () {
  const API_BASE = "/api/method/jmstar.jmstar.api.liff.";
  const AVATAR_MAX_SIZE = 2 * 1024 * 1024; // 2 MB
  const FALLBACK_LINE_UID = window.JMSTAR_TEST_LINE_UID || "TEST-LINE-UID-001";

  const Api = {
    getConfig(params) {
      return this.get("get_config", params);
    },

    async post(method, payload) {
      const response = await fetch(`${API_BASE}${method}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload || {}),
      });
      return handleResponse(response);
    },

    async postForm(method, formData) {
      const response = await fetch(`${API_BASE}${method}`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      return handleResponse(response);
    },

    async get(method, params) {
      const search = new URLSearchParams(params || {}).toString();
      const response = await fetch(`${API_BASE}${method}${search ? `?${search}` : ""}`, {
        credentials: "include",
      });
      return handleResponse(response);
    },

    authenticate(payload) {
      return this.post("authenticate", payload);
    },

    uploadChildAvatar(file, extraFields) {
      const formData = new FormData();
      formData.append("file", file);
      if (extraFields) {
        Object.entries(extraFields).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(key, value);
          }
        });
      }
      return this.postForm("upload_child_avatar", formData);
    },

    saveChild(payload) {
      return this.post("save_child", payload);
    },

    saveActivity(payload) {
      return this.post("save_activity", payload);
    },

    addStars(payload) {
      return this.post("add_stars", payload);
    },

    redeemStars(payload) {
      return this.post("redeem_stars", payload);
    },
 
    adjustStars(payload) {
      return this.post("adjust_stars", payload);
    },

    history(params) {
      return this.get("history", params);
    },
  };

  async function handleResponse(response) {
    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error("Unexpected server response");
    }

    if (!response.ok || data.exc || data.exception) {
      throw new Error(extractServerMessage(data));
    }

    return data.message || {};
  }

  function extractServerMessage(data) {
    if (data._server_messages) {
      try {
        const messages = JSON.parse(data._server_messages).map((msg) => {
          const parsed = JSON.parse(msg);
          return parsed.message || parsed;
        });
        return messages.join("\n");
      } catch (error) {
        return data._server_messages;
      }
    }

    if (data.message && typeof data.message === "string") {
      return data.message;
    }

    if (data.exc && typeof data.exc === "string") {
      return data.exc.split("\n").pop();
    }

    return "Something went wrong. Please try again.";
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const App = {
    state: {
      liffConfig: null,
      guardian: null,
      children: [],
      activities: [],
      lineUid: null,
      selectedChild: null,
    },

    childAvatarUploading: false,
    childAvatarStatusDefault: "",
    modalAlertTimeout: null,

    init() {
      this.cacheDom();
      this.bindEvents();
      this.bootstrap();
    },

    cacheDom() {
      this.$alert = $("#jmstar-alert");
      this.$guardianName = $("#guardian-name");
      this.$childrenContainer = $("#children-container");
      this.$childModal = $("#child-modal");
      this.$openChildModal = $("#open-child-modal");
      this.$childForm = $("#child-form");
      this.$childFormReset = $("#child-form-reset");
      this.$childFormTitle = $("#child-form-title");
      this.$childIdInput = $("#child-id");
      this.$childAvatarUrl = $("#child-avatar-url");
      this.$childAvatarUpload = $("#child-avatar-upload");
      this.$childAvatarPreview = $("#child-avatar-preview");
      this.$childAvatarPlaceholder = $("#child-avatar-placeholder");
      this.$childAvatarRemove = $("#child-avatar-remove");
      this.$childAvatarStatus = $("#child-avatar-status");
      this.$childSaveButton = this.$childForm.find('[type=submit]');
      if (this.$childAvatarStatus.length) {
        this.childAvatarStatusDefault = this.$childAvatarStatus.data("default") || this.$childAvatarStatus.text();
      }
      this.$activitiesContainer = $("#activities-container");
      this.$activityModal = $("#activity-modal");
      this.$openActivityModal = $("#open-activity-modal");
      this.$activityForm = $("#activity-form");
      this.$activityFormReset = $("#activity-form-reset");
      this.$activityFormTitle = $("#activity-form-title");
      this.$activityIdInput = $("#activity-id");
      this.$addStarsForm = $("#add-stars-form");
      this.$addStarsChild = $("#add-stars-child");
      this.$addStarsActivity = $("#add-stars-activity");
      this.$addStarsActivityList = $("#add-stars-activity-list");
      this.$addStarsValue = $("#add-stars-value");
      this.$historyChildDisplay = $("#history-child-display");
      this.$historyBody = $("#history-table tbody");
      this.$redeemForm = $("#redeem-form");
      this.$redeemChild = $("#redeem-child");
      this.$adjustForm = $("#adjust-form");
      this.$adjustChild = $("#adjust-child");
      this.$adjustStarsInput = $("#adjust-stars-value");
      this.$starsActionPanels = $("#stars-action-panels");
      this.$starsActionModal = $("#stars-action-modal");
      this.$starsModalAlert = $("#stars-modal-alert");
      this.$selectedChildName = $("#selected-child-name");
      this.$selectedChildAvailable = $("#selected-child-available");
      this.$selectedChildTotal = $("#selected-child-total");
      this.$selectedChildAvatar = $("#selected-child-avatar");
      this.$loadingOverlay = $("#jmstar-loading");

      const bootstrapLib =
        (typeof window !== "undefined" && window.bootstrap && window.bootstrap.Modal && window.bootstrap) ||
        (typeof bootstrap !== "undefined" && bootstrap.Modal ? bootstrap : null);

      this.bootstrapLib = bootstrapLib;

      this.childModal =
        this.$childModal.length && bootstrapLib && bootstrapLib.Modal
          ? new bootstrapLib.Modal(this.$childModal[0], { backdrop: "static" })
          : null;
      this.activityModal =
        this.$activityModal.length && bootstrapLib && bootstrapLib.Modal
          ? new bootstrapLib.Modal(this.$activityModal[0], { backdrop: "static" })
          : null;
      this.starsActionModal =
        this.$starsActionModal.length && bootstrapLib && bootstrapLib.Modal
          ? new bootstrapLib.Modal(this.$starsActionModal[0], { backdrop: true })
          : null;
    },

    bindEvents() {
      if (this.$openChildModal.length) {
        this.$openChildModal.on("click", () => {
          this.resetChildForm();
          this.showChildModal();
        });
      }

      if (this.$childModal.length) {
        this.$childModal.on("hidden.bs.modal", () => {
          this.resetChildForm();
        });
      }

      if (this.$childForm.length) {
        this.$childForm.on("submit", (event) => {
          event.preventDefault();
          this.handleChildSubmit();
        });
      }

      if (this.$childFormReset.length) {
        this.$childFormReset.on("click", () => {
          this.closeChildModal();
          this.resetChildForm();
        });
      }

      if (this.$childAvatarUpload.length) {
        this.$childAvatarUpload.on("change", (event) => this.handleChildAvatarSelected(event));
      }

      if (this.$childAvatarRemove.length) {
        this.$childAvatarRemove.on("click", (event) => {
          event.preventDefault();
          this.clearChildAvatar();
        });
      }

      if (this.$childrenContainer.length) {
        this.$childrenContainer.on("click", "[data-action=edit-child]", (event) => {
          const childId = $(event.currentTarget).data("childId");
          this.populateChildForm(childId);
        });

        this.$childrenContainer.on("click", "[data-action=set-default-child]", (event) => {
          const childId = $(event.currentTarget).data("childId");
          this.selectChild(childId, { scrollToHistory: true });
        });

        this.$childrenContainer.on("click", "[data-action=choose-star-child]", (event) => {
          const childId = $(event.currentTarget).data("childId");
          if (childId) {
            this.selectStarChild(childId);
          }
        });
      }

      if (this.$openActivityModal.length) {
        this.$openActivityModal.on("click", () => {
          this.resetActivityForm();
          this.showActivityModal();
        });
      }

      if (this.$activityModal.length) {
        this.$activityModal.on("hidden.bs.modal", () => {
          this.resetActivityForm();
        });
      }

      if (this.$activityForm.length) {
        this.$activityForm.on("submit", (event) => {
          event.preventDefault();
          this.handleActivitySubmit();
        });
      }

      if (this.$activityFormReset.length) {
        this.$activityFormReset.on("click", () => {
          this.closeActivityModal();
          this.resetActivityForm();
        });
      }

      if (this.$activitiesContainer.length) {
        this.$activitiesContainer.on("click", "[data-action=edit-activity]", (event) => {
          const activityId = $(event.currentTarget).data("activityId");
          this.populateActivityForm(activityId);
        });
      }

      if (this.$addStarsForm.length) {
        this.$addStarsForm.on("submit", (event) => {
          event.preventDefault();
          this.handleAddStars();
        });
      }

      if (this.$addStarsActivity.length) {
        this.$addStarsActivity.on("change", () => {
          this.syncActivityDefaultValue();
        });
      }

      if (this.$addStarsActivityList.length) {
        this.$addStarsActivityList.on("click", "[data-action=choose-activity]", (event) => {
          const activityId = $(event.currentTarget).data("activityId");
          this.setActivitySelection(activityId || "");
        });
      }

      if (this.$starsActionModal.length) {
        this.$starsActionModal.on("hidden.bs.modal", () => {
          this.showModalAlert();
        });
      }

      if (this.$redeemForm.length) {
        this.$redeemForm.on("submit", (event) => {
          event.preventDefault();
          this.handleRedeem();
        });
      }

      if (this.$adjustForm.length) {
        this.$adjustForm.on("submit", (event) => {
          event.preventDefault();
          this.handleAdjustStars();
        });
      }

    },

    async bootstrap() {
      this.toggleLoading(true);
      try {
        const environment = document.body.dataset.environment;
        this.state.liffConfig = await Api.getConfig(
          environment ? { environment } : undefined
        );

        const profile = await this.resolveProfile();
        this.state.lineUid = profile.line_uid;

        const data = await Api.authenticate(profile);
        this.state.guardian = data.guardian;
        this.state.children = data.children || [];
        this.state.activities = data.activities || [];

        this.renderGuardian();
        this.renderChildren();
        this.renderActivities();
        this.updateChildSelects();
        this.updateActivitySelects();
 
        const screen = document.body.dataset.screen || "menu";
        if (screen === "stars") {
          this.state.selectedChild = null;
          this.renderChildren();
          this.showStarsActionPanels();
        } else if (this.state.children.length) {
          this.selectChild(this.state.children[0].name, { refreshHistory: true });
        }
      } catch (error) {
        this.showAlert(error.message, "danger");
      } finally {
        this.toggleLoading(false);
      }
    },

    async resolveProfile() {
      if (window.liff && typeof window.liff.init === "function") {
        const liffConfig = this.state && this.state.liffConfig ? this.state.liffConfig : null;
        const liffId = liffConfig ? liffConfig.liff_id : null;
        if (!liffId) {
          console.warn("Missing LIFF ID configuration; falling back to test UID");
        } else {
          try {
            await window.liff.init({ liffId, withLoginOnExternalBrowser: true });
            if (!window.liff.isLoggedIn()) {
              window.liff.login();
              return { line_uid: FALLBACK_LINE_UID, display_name: "Guest", avatar: null };
            }
            const profile = await window.liff.getProfile();
            return {
              line_uid: profile.userId,
              display_name: profile.displayName,
              avatar: profile.pictureUrl,
            };
          } catch (error) {
            console.warn("LIFF initialization failed, falling back to test UID", error);
          }
        }
      }

      return {
        line_uid: FALLBACK_LINE_UID,
        display_name: "Test Guardian",
        avatar: null,
      };
    },

    renderGuardian() {
      if (!this.state.guardian) {
        this.$guardianName.text("-");
        return;
      }

      this.$guardianName.text(this.state.guardian.display_name || "Guardian");
    },

    renderChildren() {
      const screen = document.body.dataset.screen || "menu";
      if (screen === "stars") {
        this.renderStarChildList();
        return;
      }

      if (!this.state.children.length) {
        this.$childrenContainer.html(
          '<div class="col"><div class="alert alert-info mb-0">ยังไม่มีรายชื่อเด็ก ลองเพิ่มเลย!</div></div>'
        );
        return;
      }

      const cards = this.state.children.map((child) => {
        const isActive = this.state.selectedChild === child.name;
        const avatarUrl = child.avatar ? encodeURI(child.avatar) : "";
        const childId = escapeHtml(child.name);
        const displayName = escapeHtml(child.display_name || child.child_name);
        const nickname = escapeHtml(child.nickname || "ไม่มีชื่อเล่น");
        const totalStarsValue = parseInt(child.total_stars, 10);
        const availableStarsValue = parseInt(child.available_stars, 10);
        const totalStars = Number.isFinite(totalStarsValue) ? totalStarsValue : 0;
        const availableStars = Number.isFinite(availableStarsValue) ? availableStarsValue : 0;
        return `
          <div class="col">
            <div class="card child-card ${isActive ? "active" : ""}">
              <div class="card-body d-flex align-items-center">
                <div class="child-avatar me-3" style="background-image: url('${avatarUrl}')"></div>
                <div class="flex-grow-1">
                  <h5 class="card-title mb-1">${displayName}</h5>
                  <p class="card-subtitle text-muted mb-2">${nickname}</p>
                  <div class="d-flex gap-2">
                    <span class="badge bg-success">รวม ${totalStars} ⭐️</span>
                    <span class="badge bg-warning text-dark">คงเหลือ ${availableStars} ⭐️</span>
                  </div>
                </div>
                <div class="ms-3 btn-group-vertical">
                  <button class="btn btn-outline-primary btn-sm" data-action="set-default-child" data-child-id="${childId}">เลือก</button>
                  <button class="btn btn-outline-secondary btn-sm" data-action="edit-child" data-child-id="${childId}">แก้ไข</button>
                </div>
              </div>
            </div>
          </div>
        `;
      });

      this.$childrenContainer.html(cards.join(""));
    },

    renderStarChildList() {
      if (!this.$childrenContainer.length) {
        return;
      }

      if (!this.state.children.length) {
        this.$childrenContainer.html(
          '<div class="alert alert-info mb-0">ยังไม่มีรายชื่อเด็ก ลองเพิ่มได้จากเมนู "ตั้งค่า"</div>'
        );
        this.state.selectedChild = null;
        this.showStarsActionPanels();
        return;
      }

      const childEntries = this.state.children.map((child) => {
        const avatarUrl = child.avatar ? encodeURI(child.avatar) : "";
        const isSelected = this.state.selectedChild === child.name;
        const childId = escapeHtml(child.name);
        const displayName = escapeHtml(child.display_name || child.child_name);
        const availableStarsValue = parseInt(child.available_stars, 10);
        const availableStars = Number.isFinite(availableStarsValue) ? availableStarsValue : 0;
        return `
          <div class="col-md-4 mb-3">
            <div class="card child-card child-card--action ${isSelected ? "active" : ""}" data-action="choose-star-child" data-child-id="${childId}">
              <div class="card-body text-center">
                <div class="child-avatar mx-auto mb-3" style="background-image: url('${avatarUrl}')"></div>
                <h5 class="card-title">${displayName}</h5>
                <p class="card-subtitle text-muted">คงเหลือ ${availableStars} ⭐️</p>
                <p class="mt-2 text-muted small">แตะเพื่อเลือกและจัดการดาว</p>
              </div>
            </div>
          </div>
        `;
      });
 
      this.$childrenContainer.html(childEntries.join(""));
    },

    renderActivities() {
      if (!this.$activitiesContainer.length) {
        return;
      }

      if (!this.state.activities.length) {
        this.$activitiesContainer.html(
          '<div class="col"><div class="alert alert-info mb-0">ยังไม่มีกิจกรรม ลองเพิ่มได้เลย!</div></div>'
        );
        return;
      }

      const cards = this.state.activities.map((activity) => {
        const statusBadge = activity.is_active
          ? '<span class="badge bg-success">ใช้งาน</span>'
          : '<span class="badge bg-secondary">ปิดอยู่</span>';
        const activityId = escapeHtml(activity.name);
        const activityName = escapeHtml(activity.activity_name || "กิจกรรม");
        const category = escapeHtml(activity.category || "ไม่ระบุหมวด");
        const starValue = parseInt(activity.default_star_value, 10);
        const stars = Number.isFinite(starValue) ? starValue : 0;
        const description = activity.description
          ? `<p class="text-muted small mb-2">${escapeHtml(activity.description)}</p>`
          : "";
        const colorValue =
          typeof activity.color === "string" && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(activity.color.trim())
            ? activity.color.trim()
            : null;
        const colorChip = colorValue
          ? `<span class="badge rounded-pill border" style="background-color: ${colorValue};">&nbsp;</span>`
          : "";

        return `
          <div class="col">
            <div class="card activity-card h-100">
              <div class="card-body d-flex flex-column gap-2">
                <div class="d-flex justify-content-between align-items-start">
                  <div>
                    <h5 class="card-title mb-1">${activityName}</h5>
                    <div class="d-flex gap-2 align-items-center text-muted small">
                      <span>${category}</span>
                      ${colorChip}
                    </div>
                  </div>
                  ${statusBadge}
                </div>
                ${description}
                <div class="d-flex justify-content-between align-items-center mt-auto">
                  <span class="badge bg-warning text-dark">ให้ ${stars} ⭐️</span>
                  <button class="btn btn-sm btn-outline-secondary" data-action="edit-activity" data-activity-id="${activityId}">แก้ไข</button>
                </div>
              </div>
            </div>
          </div>
        `;
      });

      this.$activitiesContainer.html(cards.join(""));
    },

    updateChildSelects() {
      const selectedChildId = this.state.selectedChild || "";
      const childSummary = this.getChildData(selectedChildId);

      if (this.$addStarsChild.length) {
        this.$addStarsChild.val(selectedChildId);
      }

      if (this.$adjustChild.length) {
        this.$adjustChild.val(selectedChildId);
      }

      if (this.$redeemChild && this.$redeemChild.length) {
        this.$redeemChild.val(selectedChildId);
      }

      if (this.$historyChildDisplay && this.$historyChildDisplay.length) {
        this.$historyChildDisplay.text(childSummary ? childSummary.displayName : "-");
      }

      if (!this.state.children.length) {
        return;
      }
    },

    updateActivitySelects() {
      const selectedActivityId = this.$addStarsActivity.val() || "";

      if (!this.$addStarsActivityList.length) {
        return;
      }

      if (!this.state.activities.length) {
        this.$addStarsActivityList.html(
          '<div class="alert alert-info mb-0">ยังไม่มีกิจกรรม ลองเพิ่มในเมนู "ตั้งค่า" ก่อนนะ</div>'
        );
        this.setActivitySelection("");
        return;
      }

      const manualOption = `
        <div class="activity-radio-option ${selectedActivityId ? "" : "active"}" data-action="choose-activity" data-activity-id="">
          <div class="activity-name">ไม่ระบุกิจกรรม</div>
          <div class="activity-meta">
            <span>กำหนดจำนวนดาวเองได้</span>
          </div>
        </div>
      `;

      const options = this.state.activities.map((activity) => {
        const activityId = escapeHtml(activity.name);
        const isActive = selectedActivityId === activity.name;
        const starValue = parseInt(activity.default_star_value, 10);
        const stars = Number.isFinite(starValue) ? starValue : 0;
        const category = escapeHtml(activity.category || "ไม่ระบุหมวด");
        const activityName = escapeHtml(activity.activity_name || "กิจกรรม");
        const description = activity.description
          ? `<div class="text-muted small">${escapeHtml(activity.description)}</div>`
          : "";
        return `
          <div class="activity-radio-option ${isActive ? "active" : ""}" data-action="choose-activity" data-activity-id="${activityId}">
            <div class="activity-name">${activityName}</div>
            <div class="activity-meta">
              <span>${category}</span>
              <span class="activity-stars">+${stars} ⭐️</span>
            </div>
            ${description}
          </div>
        `;
      });

      this.$addStarsActivityList.html(manualOption + options.join(""));
      this.setActivitySelection(selectedActivityId);
    },

    selectChild(childId, { refreshHistory = false, scrollToHistory = false } = {}) {
      this.state.selectedChild = childId;
      this.renderChildren();
      this.updateChildSelects();

      if (refreshHistory) {
        this.refreshHistory();
      }

      if (scrollToHistory) {
        const historySection = document.getElementById("tab-history");
        if (historySection) {
          historySection.scrollIntoView({ behavior: "smooth" });
        }
      }
    },

    selectStarChild(childId) {
      this.state.selectedChild = childId;
      this.showModalAlert();
      this.renderChildren();
      this.showStarsActionPanels();
      this.openStarsTab("add");
    },

    populateChildForm(childId) {
      const child = this.state.children.find((item) => item.name === childId);
      if (!child) return;

      this.$childIdInput.val(child.name);
      this.$childForm.find("[name=child_name]").val(child.child_name || "");
      this.$childForm.find("[name=date_of_birth]").val(child.date_of_birth || "");
      this.setChildAvatarPreview(child.avatar || "");
      this.updateChildAvatarStatus(child.avatar ? "มีรูปโปรไฟล์แล้ว" : undefined);
      this.toggleChildSaveButton(false);

      this.$childFormTitle.text("แก้ไขข้อมูลเด็ก");
      this.showChildModal();
    },

    resetChildForm() {
      if (!this.$childForm.length) {
        return;
      }

      this.$childIdInput.val("");
      this.$childForm.trigger("reset");
      this.clearChildAvatar();
      this.childAvatarUploading = false;
      this.toggleChildSaveButton(false);
      this.$childFormTitle.text("เพิ่มเด็กใหม่");
    },

    updateChildAvatarStatus(message, variant = "info") {
      if (!this.$childAvatarStatus || !this.$childAvatarStatus.length) {
        return;
      }
      const text = message || this.childAvatarStatusDefault || "";
      this.$childAvatarStatus.text(text);
      if (variant === "error") {
        this.$childAvatarStatus.removeClass("text-muted text-success").addClass("text-danger");
      } else if (variant === "success") {
        this.$childAvatarStatus.removeClass("text-muted text-danger").addClass("text-success");
      } else {
        this.$childAvatarStatus.removeClass("text-danger text-success");
        if (!this.$childAvatarStatus.hasClass("text-muted")) {
          this.$childAvatarStatus.addClass("text-muted");
        }
      }
    },

    setChildAvatarPreview(url) {
      const hasUrl = Boolean(url);
      if (this.$childAvatarPreview && this.$childAvatarPreview.length) {
        if (hasUrl) {
          this.$childAvatarPreview.attr("src", encodeURI(url)).removeClass("d-none");
        } else {
          this.$childAvatarPreview.attr("src", "").addClass("d-none");
        }
      }

      if (this.$childAvatarPlaceholder && this.$childAvatarPlaceholder.length) {
        this.$childAvatarPlaceholder.toggleClass("d-none", hasUrl);
      }

      if (this.$childAvatarRemove && this.$childAvatarRemove.length) {
        this.$childAvatarRemove.toggleClass("d-none", !hasUrl);
      }

      if (this.$childAvatarUrl && this.$childAvatarUrl.length) {
        this.$childAvatarUrl.val(hasUrl ? url : "");
      }
    },

    clearChildAvatar() {
      if (this.$childAvatarUpload && this.$childAvatarUpload.length) {
        this.$childAvatarUpload.val("");
      }
      this.setChildAvatarPreview("");
      this.updateChildAvatarStatus();
    },

    toggleChildSaveButton(forceDisabled) {
      if (!this.$childSaveButton || !this.$childSaveButton.length) {
        return;
      }
      const disabled = typeof forceDisabled === "boolean" ? forceDisabled : this.childAvatarUploading;
      this.$childSaveButton.prop("disabled", disabled);
    },

    async handleChildAvatarSelected(event) {
      const input = event.currentTarget;
      if (!input || !input.files || !input.files.length) {
        return;
      }

      const file = input.files[0];
      if (!file) {
        return;
      }

      if (file.type && !file.type.startsWith("image/")) {
        this.updateChildAvatarStatus("กรุณาเลือกรูปภาพเท่านั้น", "error");
        this.$childAvatarUpload.val("");
        return;
      }

      if (file.size > AVATAR_MAX_SIZE) {
        this.updateChildAvatarStatus("ขนาดไฟล์ต้องไม่เกิน 2 MB", "error");
        this.$childAvatarUpload.val("");
        return;
      }

      if (!this.state.lineUid) {
        this.updateChildAvatarStatus("ยังไม่พร้อมอัปโหลด กรุณาลองใหม่อีกครั้ง", "error");
        this.$childAvatarUpload.val("");
        return;
      }

      this.childAvatarUploading = true;
      this.toggleChildSaveButton(true);
      this.updateChildAvatarStatus("กำลังอัปโหลดรูป...", "info");

      try {
        const result = await Api.uploadChildAvatar(file, { line_uid: this.state.lineUid });
        if (result.file_url) {
          this.setChildAvatarPreview(result.file_url);
          this.updateChildAvatarStatus("อัปโหลดเรียบร้อยแล้ว", "success");
        } else {
          this.updateChildAvatarStatus("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
        }
      } catch (error) {
        this.updateChildAvatarStatus(error.message || "อัปโหลดไม่สำเร็จ", "error");
      } finally {
        this.childAvatarUploading = false;
        this.toggleChildSaveButton(false);
        if (this.$childAvatarUpload && this.$childAvatarUpload.length) {
          this.$childAvatarUpload.val("");
        }
      }
    },

    showChildModal() {
      if (this.childModal) {
        this.childModal.show();
        return;
      }

      if (this.$childModal.length) {
        this.$childModal.addClass("show").attr("aria-hidden", "false").css("display", "block");
        document.body.classList.add("modal-open");
      }
    },

    closeChildModal() {
      if (this.childModal) {
        this.childModal.hide();
        return;
      }

      if (this.$childModal.length) {
        this.$childModal.removeClass("show").attr("aria-hidden", "true").css("display", "none");
        document.body.classList.remove("modal-open");
      }
    },

    populateActivityForm(activityId) {
      const activity = this.state.activities.find((item) => item.name === activityId);
      if (!activity) return;

      this.$activityIdInput.val(activity.name);
      this.$activityForm.find("[name=activity_name]").val(activity.activity_name || "");
      this.$activityForm.find("[name=category]").val(activity.category || "");
      this.$activityForm.find("[name=default_star_value]").val(activity.default_star_value || 0);
      this.$activityForm.find("[name=color]").val(activity.color || "");
      this.$activityForm.find("[name=description]").val(activity.description || "");
      this.$activityForm.find("[name=is_active]").prop("checked", !!activity.is_active);

      this.$activityFormTitle.text("แก้ไขกิจกรรม");
      this.showActivityModal();
    },

    resetActivityForm() {
      if (!this.$activityForm.length) {
        return;
      }

      this.$activityIdInput.val("");
      this.$activityForm.trigger("reset");
      this.$activityForm.find("[name=default_star_value]").val(1);
      this.$activityForm.find("[name=is_active]").prop("checked", true);
      this.$activityFormTitle.text("เพิ่มกิจกรรมใหม่");
    },

    showActivityModal() {
      if (this.activityModal) {
        this.activityModal.show();
        return;
      }

      if (this.$activityModal.length) {
        this.$activityModal.addClass("show").attr("aria-hidden", "false").css("display", "block");
        document.body.classList.add("modal-open");
      }
    },

    closeActivityModal() {
      if (this.activityModal) {
        this.activityModal.hide();
        return;
      }

      if (this.$activityModal.length) {
        this.$activityModal.removeClass("show").attr("aria-hidden", "true").css("display", "none");
        document.body.classList.remove("modal-open");
      }
    },

    async handleChildSubmit() {
      if (this.childAvatarUploading) {
        this.updateChildAvatarStatus("กำลังอัปโหลดรูปอยู่ กรุณารอสักครู่", "error");
        return;
      }

      const formData = new FormData(this.$childForm[0]);
      const payload = Object.fromEntries(formData.entries());
      payload.line_uid = this.state.lineUid;

      try {
        const result = await Api.saveChild(payload);
        const child = result.child;
        const existingIndex = this.state.children.findIndex((item) => item.name === child.name);

        if (existingIndex > -1) {
          this.state.children.splice(existingIndex, 1, child);
        } else {
          this.state.children.unshift(child);
        }

        this.renderChildren();
        this.updateChildSelects();
        this.closeChildModal();
        this.resetChildForm();
        this.showAlert("บันทึกข้อมูลเด็กเรียบร้อยแล้ว", "success");
      } catch (error) {
        this.showAlert(error.message, "danger");
      }
    },

    async handleActivitySubmit() {
      const formData = new FormData(this.$activityForm[0]);
      const payload = Object.fromEntries(formData.entries());
      payload.line_uid = this.state.lineUid;
      payload.is_active = payload.is_active ? 1 : 0;
      payload.default_star_value = parseInt(payload.default_star_value || "0", 10) || 0;

      try {
        const result = await Api.saveActivity(payload);
        const activity = result.activity;
        const index = this.state.activities.findIndex((item) => item.name === activity.name);

        if (index > -1) {
          this.state.activities.splice(index, 1, activity);
        } else {
          this.state.activities.unshift(activity);
        }

        this.renderActivities();
        this.updateActivitySelects();
        this.closeActivityModal();
        this.resetActivityForm();
        this.showAlert("บันทึกกิจกรรมเรียบร้อยแล้ว", "success");
      } catch (error) {
        this.showAlert(error.message, "danger");
      }
    },

    async handleAddStars() {
      const formData = new FormData(this.$addStarsForm[0]);
      const payload = Object.fromEntries(formData.entries());
      payload.line_uid = this.state.lineUid;
      payload.stars = parseInt(payload.stars, 10);
      payload.activity = payload.activity || null;

      if (!payload.child) {
        this.showAlert("กรุณาเลือกเด็ก", "warning");
        this.showModalAlert("กรุณาเลือกเด็กก่อนเพิ่มดาว", "warning");
        return;
      }

      if (!payload.stars || payload.stars <= 0) {
        this.showAlert("จำนวนดาวต้องมากกว่า 0", "warning");
        this.showModalAlert("จำนวนดาวต้องมากกว่า 0", "warning");
        return;
      }

      try {
        const result = await Api.addStars(payload);
        this.updateChildBalances(payload.child, {
          available: result.available_stars,
          totalDelta: result.entry.stars > 0 ? result.entry.stars : 0,
        });

        this.renderChildren();
        this.updateChildSelects();
        this.showAlert("เพิ่มดาวเรียบร้อยแล้ว", "success");
        this.showModalAlert("เพิ่มดาวให้น้องเรียบร้อยแล้ว", "success");
        this.refreshHistory();
        this.showStarsActionPanels();
        this.openStarsTab("add");
      } catch (error) {
        this.showAlert(error.message, "danger");
        this.showModalAlert(error.message, "danger");
      }
    },

    async handleRedeem() {
      const formData = new FormData(this.$redeemForm[0]);
      const payload = Object.fromEntries(formData.entries());
      payload.line_uid = this.state.lineUid;
      payload.stars = parseInt(payload.stars, 10);

      if (!payload.child) {
        this.showAlert("กรุณาเลือกเด็ก", "warning");
        this.showModalAlert("กรุณาเลือกเด็กก่อนแลกดาว", "warning");
        return;
      }

      if (!payload.stars || payload.stars <= 0) {
        this.showAlert("จำนวนดาวที่ต้องการแลกต้องมากกว่า 0", "warning");
        this.showModalAlert("จำนวนดาวที่ต้องการแลกต้องมากกว่า 0", "warning");
        return;
      }

      try {
        const result = await Api.redeemStars(payload);
        this.updateChildBalances(payload.child, {
          available: result.available_stars,
        });

        this.renderChildren();
        this.updateChildSelects();
        this.showAlert("แลกดาวเรียบร้อยแล้ว", "success");
        this.showModalAlert("แลกดาวเรียบร้อยแล้ว", "success");
        this.refreshHistory();
        this.showStarsActionPanels();
        this.openStarsTab("redeem");
      } catch (error) {
        this.showAlert(error.message, "danger");
        this.showModalAlert(error.message, "danger");
      }
    },
 
    async handleAdjustStars() {
      const formData = new FormData(this.$adjustForm[0]);
      const payload = Object.fromEntries(formData.entries());
      payload.line_uid = this.state.lineUid;

      const amount = parseInt(payload.stars, 10);
      if (!payload.child) {
        this.showAlert("กรุณาเลือกเด็ก", "warning");
        this.showModalAlert("กรุณาเลือกเด็กก่อนปรับยอด", "warning");
        return;
      }

      if (Number.isNaN(amount) || amount === 0) {
        this.showAlert("กรุณาระบุจำนวนดาวที่จะปรับ (ไม่เป็นศูนย์)", "warning");
        this.showModalAlert("กรุณาระบุจำนวนดาวที่จะปรับ (ไม่เป็นศูนย์)", "warning");
        return;
      }

      payload.stars = amount;

      try {
        const result = await Api.adjustStars(payload);
        this.updateChildBalances(payload.child, {
          available: result.available_stars,
        });

        this.renderChildren();
        this.updateChildSelects();
        this.showAlert("ปรับยอดดาวเรียบร้อยแล้ว", "success");
        this.showModalAlert("ปรับยอดดาวเรียบร้อยแล้ว", "success");
        this.refreshHistory();
        this.showStarsActionPanels();
        this.openStarsTab("history");
        if (this.$adjustStarsInput && this.$adjustStarsInput.length) {
          this.$adjustStarsInput.val(0);
        }
      } catch (error) {
        this.showAlert(error.message, "danger");
        this.showModalAlert(error.message, "danger");
      }
    },

    async refreshHistory() {
      if (!this.$historyBody || !this.$historyBody.length) {
        return;
      }

      const childId = this.state.selectedChild;
      if (!childId) {
        this.$historyBody.html(
          '<tr><td colspan="6" class="text-center text-muted">ยังไม่มีข้อมูล</td></tr>'
        );
        if (this.$historyChildDisplay && this.$historyChildDisplay.length) {
          this.$historyChildDisplay.text("-");
        }
        return;
      }

      try {
        const result = await Api.history({
          line_uid: this.state.lineUid,
          child: childId,
          limit: 20,
        });

        const childSummary = this.getChildData(childId);
        if (this.$historyChildDisplay && this.$historyChildDisplay.length) {
          this.$historyChildDisplay.text(childSummary ? childSummary.displayName : "-");
        }

        const rows = (result.entries || []).map((entry) => {
          const typeBadge = this.resolveTypeBadge(entry.transaction_type, entry.stars);
          const notes = entry.redemption_use || entry.notes || "-";
          const activity = entry.activity_name || entry.activity || "-";
          return `
            <tr>
              <td>${new Date(entry.posting_datetime).toLocaleString()}</td>
              <td>${activity}</td>
              <td>${typeBadge}</td>
              <td class="text-end">${entry.stars}</td>
              <td class="text-end">${entry.balance_after}</td>
              <td>${notes}</td>
            </tr>
          `;
        });

        this.$historyBody.html(
          rows.join("") || '<tr><td colspan="6" class="text-center text-muted">ยังไม่มีประวัติ</td></tr>'
        );
      } catch (error) {
        this.showAlert(error.message, "danger");
      }
    },

    updateChildBalances(childId, { available, totalDelta = 0 }) {
      const child = this.state.children.find((item) => item.name === childId);
      if (!child) return;

      child.available_stars = available;
      child.total_stars = (child.total_stars || 0) + totalDelta;
    },

    resolveTypeBadge(transactionType, stars) {
      const value = parseInt(stars, 10);
      if (transactionType === "Earn" && value > 0) {
        return '<span class="badge bg-success">ได้รับ</span>';
      }
      if (transactionType === "Redeem" || value < 0) {
        return '<span class="badge bg-danger">แลก</span>';
      }
      return '<span class="badge bg-secondary">ปรับ</span>';
    },

    syncActivityDefaultValue() {
      const selectedActivityId = this.$addStarsActivity.val();
      if (!selectedActivityId) {
        return;
      }

      const activity = this.state.activities.find((item) => item.name === selectedActivityId);
      if (!activity) {
        return;
      }

      const suggestedStars = parseInt(activity.default_star_value, 10);
      if (!Number.isNaN(suggestedStars) && suggestedStars > 0) {
        this.$addStarsValue.val(suggestedStars);
      }
    },

    toggleLoading(isLoading) {
      this.$loadingOverlay.toggleClass("d-none", !isLoading);
    },

    showAlert(message, variant = "info") {
      const alertHtml = `
        <div class="alert alert-${variant} alert-dismissible fade show" role="alert">
          ${message}
          <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
      `;
      this.$alert.html(alertHtml);
    },

    showModalAlert(message, variant = "info", options = {}) {
      if (!this.$starsModalAlert || !this.$starsModalAlert.length) {
        return;
      }

      if (this.modalAlertTimeout) {
        clearTimeout(this.modalAlertTimeout);
        this.modalAlertTimeout = null;
      }

      if (!message) {
        this.$starsModalAlert.stop(true, true).empty().show();
        return;
      }

      const alertHtml = `
        <div class="alert alert-${variant} alert-dismissible fade show" role="alert">
          ${message}
          <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
      `;

      this.$starsModalAlert.stop(true, true).hide().html(alertHtml).fadeIn(150);

      const modalBody = this.$starsModalAlert.closest(".modal-body");
      if (modalBody && modalBody.length) {
        if (typeof modalBody[0].scrollTo === "function") {
          modalBody[0].scrollTo({ top: 0, behavior: "smooth" });
        } else {
          modalBody.scrollTop(0);
        }
      }

      const autoDismiss = options.autoDismiss !== false;
      const duration = Number.isFinite(options.duration) ? options.duration : 4000;
      if (autoDismiss) {
        this.modalAlertTimeout = setTimeout(() => {
          this.$starsModalAlert.fadeOut(200, () => {
            this.$starsModalAlert.empty().show();
          });
          this.modalAlertTimeout = null;
        }, duration);
      }
    },
 
    showStarsActionPanels() {
      if (!this.$starsActionPanels || !this.$starsActionPanels.length) {
        return;
      }

      if (!this.state.selectedChild) {
        this.updateSelectedChildSummary();
        this.closeStarsActionModal();
        this.showModalAlert();
        return;
      }

      this.updateSelectedChildSummary();
      this.updateChildSelects();
      this.refreshHistory();
      if (this.$adjustStarsInput && this.$adjustStarsInput.length) {
        this.$adjustStarsInput.val(0);
      }
      this.openStarsActionModal();
    },

    openStarsActionModal() {
      if (this.starsActionModal) {
        this.starsActionModal.show();
        return;
      }

      if (this.$starsActionModal && this.$starsActionModal.length) {
        this.$starsActionModal.addClass("show").attr("aria-hidden", "false").css("display", "block");
        document.body.classList.add("modal-open");
      }
    },

    closeStarsActionModal() {
      if (this.starsActionModal) {
        this.starsActionModal.hide();
        this.showModalAlert();
        return;
      }

      if (this.$starsActionModal && this.$starsActionModal.length) {
        this.$starsActionModal.removeClass("show").attr("aria-hidden", "true").css("display", "none");
        document.body.classList.remove("modal-open");
      }
      this.showModalAlert();
    },

    updateSelectedChildSummary() {
      if (!this.$selectedChildName || !this.$selectedChildName.length) {
        return;
      }

      const childData = this.getChildData(this.state.selectedChild);
      if (!childData) {
        this.$selectedChildName.text("เลือกน้องเพื่อจัดการดาว");
        if (this.$selectedChildAvailable && this.$selectedChildAvailable.length) {
          this.$selectedChildAvailable.text("0");
        }
        if (this.$selectedChildTotal && this.$selectedChildTotal.length) {
          this.$selectedChildTotal.text("0");
        }
        if (this.$selectedChildAvatar && this.$selectedChildAvatar.length) {
          this.$selectedChildAvatar.css("background-image", "");
        }
        return;
      }

      this.$selectedChildName.text(childData.displayName);
      if (this.$selectedChildAvailable && this.$selectedChildAvailable.length) {
        this.$selectedChildAvailable.text(childData.available);
      }
      if (this.$selectedChildTotal && this.$selectedChildTotal.length) {
        this.$selectedChildTotal.text(childData.total);
      }

      if (this.$selectedChildAvatar && this.$selectedChildAvatar.length) {
        if (childData.avatarUrl) {
          this.$selectedChildAvatar.css("background-image", `url('${childData.avatarUrl}')`);
        } else {
          this.$selectedChildAvatar.css("background-image", "");
        }
      }
    },

    getChildData(childId) {
      if (!childId) {
        return null;
      }

      const child = this.state.children.find((item) => item.name === childId);
      if (!child) {
        return null;
      }

      const displayName = child.display_name || child.child_name || "น้องคนนี้";
      const availableValue = parseInt(child.available_stars, 10);
      const totalValue = parseInt(child.total_stars, 10);

      return {
        child,
        id: child.name,
        displayName,
        available: Number.isFinite(availableValue) ? availableValue : 0,
        total: Number.isFinite(totalValue) ? totalValue : 0,
        avatarUrl: child.avatar ? encodeURI(child.avatar) : "",
      };
    },

    setActivitySelection(activityId) {
      const normalizedId = activityId || "";
      if (this.$addStarsActivity && this.$addStarsActivity.length) {
        this.$addStarsActivity.val(normalizedId);
      }

      if (this.$addStarsActivityList && this.$addStarsActivityList.length) {
        this.$addStarsActivityList
          .find("[data-action=choose-activity]")
          .each((index, element) => {
            const $option = $(element);
            const optionId = $option.data("activityId") || "";
            $option.toggleClass("active", optionId === normalizedId);
          });
      }

      if (normalizedId) {
        this.syncActivityDefaultValue();
      }
    },

    openStarsTab(target) {
      if (!this.$starsActionPanels || !this.$starsActionPanels.length) {
        return;
      }

      const tabTrigger = document.querySelector(`[data-bs-target="#tab-${target}"]`);
      if (tabTrigger && typeof window.bootstrap !== "undefined" && window.bootstrap.Tab) {
        new window.bootstrap.Tab(tabTrigger).show();
      }

      const section = document.getElementById(`tab-${target}`);
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
  };

  $(document).ready(() => {
    App.init();
  });
})();

