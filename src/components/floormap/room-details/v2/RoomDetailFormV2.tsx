import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { PhotoSection } from "../PhotoSection";
import { RoomHeroV2 } from "./RoomHeroV2";
import { OverviewTab } from "./tabs/OverviewTab";
import { MaterialTab } from "./tabs/MaterialTab";
import { MeasurementsTab } from "./tabs/MeasurementsTab";
import { RelatedTab } from "./tabs/RelatedTab";
import { ChecklistsTab } from "./tabs/ChecklistsTab";
import { countFilledFields } from "../utils/countFilledFields";
import type { RoomFormData, Room } from "../types";

interface RoomDetailFormV2Props {
  room: Room | null;
  projectId: string;
  formData: RoomFormData;
  updateFormData: (updates: Partial<RoomFormData>) => void;
  updateSpec: <K extends keyof RoomFormData>(
    specKey: K,
    updates: Partial<RoomFormData[K]>
  ) => void;
  showPinterest?: boolean;
  onPlaceItemOnPlan?: (args: { itemId: string; roomId: string; subtype: string }) => void;
  /** Room is drawn on a plan → navigate to it on the canvas. */
  onShowOnPlan?: () => void;
}

type TabKey = "overview" | "material" | "measurements" | "photos" | "checklists" | "comments" | "related";

interface TabDef {
  k: TabKey;
  label: string;
  count?: number;
  filled?: number;
  total?: number;
  hideForNew?: boolean;
}

export function RoomDetailFormV2({
  room,
  projectId,
  formData,
  updateFormData,
  updateSpec,
  showPinterest,
  onPlaceItemOnPlan,
  onShowOnPlan,
}: RoomDetailFormV2Props) {
  const { t } = useTranslation();
  const isNewRoom = !room;
  const [tab, setTab] = useState<TabKey>("overview");

  const areaSqm = room?.dimensions?.area_sqm;
  const perimeterMm = room?.dimensions?.perimeter_mm;

  const counts = countFilledFields(formData);
  const materialFilled =
    counts.floorCeiling.filled + counts.wallsJoinery.filled + counts.electricalHeating.filled;
  const materialTotal =
    counts.floorCeiling.total + counts.wallsJoinery.total + counts.electricalHeating.total;
  const overviewFilled = formData.description ? 1 : 0;

  const tabs: TabDef[] = [
    {
      k: "overview",
      label: t("rooms.tabOverview", "Översikt"),
      filled: overviewFilled,
      total: 1,
    },
    {
      k: "material",
      label: t("rooms.tabMaterial", "Material"),
      filled: materialFilled,
      total: materialTotal,
    },
    {
      k: "measurements",
      label: t("rooms.tabMeasurements", "Mått"),
    },
    {
      k: "photos",
      label: t("rooms.tabPhotos", "Foton"),
      hideForNew: true,
    },
    {
      k: "checklists",
      label: t("rooms.tabChecklists", "Checklistor"),
      count: (formData.checklists || []).length,
      hideForNew: true,
    },
    {
      k: "comments",
      label: t("rooms.tabComments", "Kommentarer"),
      hideForNew: true,
    },
    {
      k: "related",
      label: t("rooms.tabRelated", "Relaterat"),
      hideForNew: true,
    },
  ];

  const visibleTabs = tabs.filter((tt) => !(isNewRoom && tt.hideForNew));

  return (
    <div className="rf-paper flex h-full flex-col" style={{ background: "var(--rf-paper)" }}>
      {/* HERO */}
      <RoomHeroV2
        room={room}
        formData={formData}
        updateFormData={updateFormData}
        areaSqm={areaSqm}
        perimeterMm={perimeterMm}
        onShowOnPlan={onShowOnPlan}
      />

      {/* ALWAYS-VISIBLE NOTES */}
      <div className="px-6 pt-3">
        <span className="rf-section-label mb-1.5 block">
          {t("rooms.internalNotes", "Interna anteckningar")}
        </span>
        <Textarea
          value={formData.notes || ""}
          onChange={(e) => updateFormData({ notes: e.target.value })}
          placeholder={t("rooms.internalNotesPlaceholder", "Interna anteckningar...")}
          rows={2}
          className="resize-none text-sm"
          style={{ background: "var(--rf-paper-2)", borderColor: "var(--rf-hairline)" }}
        />
      </div>

      {/* TAB NAVIGATION */}
      <div
        className="mt-4 flex gap-0 overflow-x-auto border-b px-3"
        style={{ borderColor: "var(--rf-hairline)", background: "var(--rf-surface)" }}
      >
        {visibleTabs.map((tt) => {
          const active = tab === tt.k;
          const showDot = tt.total != null && tt.total > 0 && (tt.filled ?? 0) < tt.total;
          return (
            <button
              key={tt.k}
              type="button"
              onClick={() => setTab(tt.k)}
              className="relative -mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-[13px]"
              style={{
                color: active ? "var(--rf-ink)" : "var(--rf-fg-muted)",
                fontWeight: active ? 500 : 400,
                borderBottomColor: active ? "var(--rf-ink)" : "transparent",
                background: "transparent",
              }}
            >
              {tt.label}
              {tt.count != null && tt.count > 0 && (
                <span
                  className="rf-num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] px-1 text-[10px]"
                  style={{
                    background: "var(--rf-bg-sunken)",
                    color: "var(--rf-fg-muted)",
                  }}
                >
                  {tt.count}
                </span>
              )}
              {showDot && (
                <span
                  className="inline-block h-[5px] w-[5px] rounded-full"
                  style={{ background: "var(--rf-danger)" }}
                  title={`${tt.filled}/${tt.total}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}
      <div className="flex-1 overflow-y-auto" style={{ background: "var(--rf-paper)" }}>
        {tab === "overview" && (
          <OverviewTab
            formData={formData}
            updateFormData={updateFormData}
            createdAt={room?.created_at}
            updatedAt={room?.updated_at}
          />
        )}
        {tab === "material" && (
          <MaterialTab
            formData={formData}
            updateFormData={updateFormData}
            updateSpec={updateSpec}
            roomId={room?.id}
            projectId={projectId}
            onPlaceItemOnPlan={onPlaceItemOnPlan}
          />
        )}
        {tab === "measurements" && (
          <MeasurementsTab
            formData={formData}
            updateFormData={updateFormData}
            updateSpec={updateSpec}
            areaSqm={areaSqm}
            perimeterMm={perimeterMm}
            createdAt={room?.created_at}
          />
        )}
        {tab === "photos" && room && (
          <div className="px-6 py-5">
            <PhotoSection roomId={room.id} showPinterest={showPinterest} />
          </div>
        )}
        {tab === "checklists" && (
          <ChecklistsTab formData={formData} updateFormData={updateFormData} />
        )}
        {tab === "comments" && room && (
          <div className="px-6 py-5">
            <CommentsSection entityId={room.id} entityType="room" projectId={projectId} />
          </div>
        )}
        {tab === "related" && room && (
          <RelatedTab roomId={room.id} projectId={projectId} />
        )}
      </div>
    </div>
  );
}
