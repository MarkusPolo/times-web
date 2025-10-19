"use client";

import { useForm } from "react-hook-form";
import { DateTime } from "luxon";

type Props = {
  onAdd: (payload: { date: string; start: string; end: string; note?: string }) => void;
};

export default function TimesForm({ onAdd }: Props) {
  const { register, handleSubmit, reset } = useForm<{
    date: string;
    start: string;
    end: string;
    note?: string;
  }>({
    defaultValues: {
      date: DateTime.local().toISODate() || "",
      start: "09:00",
      end: "17:00",
      note: ""
    }
  });

  return (
    <form
      onSubmit={handleSubmit((v) => {
        onAdd(v);
        reset({ ...v, note: "" });
      })}
      style={{ display: "grid", gap: 8, maxWidth: 520 }}
    >
      <label>
        Datum
        <input type="date" {...register("date", { required: true })} />
      </label>
      <label>
        Start
        <input type="time" step="60" {...register("start", { required: true })} />
      </label>
      <label>
        Ende
        <input type="time" step="60" {...register("end", { required: true })} />
      </label>
      <label>
        Notiz
        <input type="text" placeholder="optional" {...register("note")} />
      </label>
      <button type="submit">Eintrag hinzufügen</button>
    </form>
  );
}
