import { get } from "../api";

export const fetchRunDetails = async (id: string) => {
  const res = await get(`/runs/${id}`);
  return res.item;
};

export const fetchRunLogs = async (id: string) => {
  const res = await get(`/runs/${id}/logs`);
  return res.items;
};

export const fetchRunTimings = async (id: string) => {
  const res = await get(`/runs/${id}/timings`);
  return res.items;
};
