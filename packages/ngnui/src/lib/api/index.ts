import { NGN_API_URL } from "@/config";

export const getApiUrl = () => {
  return NGN_API_URL;
};

export const get = async (endpoint: `/${string}`) => {
  return fetch(`${getApiUrl()}${endpoint}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }).then((response) => response.json());
};

export const post = async (endpoint: `/${string}`, body: unknown) => {
  return fetch(`${getApiUrl()}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).then((response) => response.json());
};

export const put = async (endpoint: `/${string}`, body: unknown) => {
  return fetch(`${getApiUrl()}${endpoint}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).then((response) => response.json());
};

export const del = async (endpoint: `/${string}`) => {
  return fetch(`${getApiUrl()}${endpoint}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  }).then((response) => response.json());
};

type SearchQueryValue = string | number | boolean | null | undefined;

export const getSearchQuery = (params: Record<string, SearchQueryValue>) => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      searchParams.append(key, String(value));
    }
  }

  return searchParams.toString();
};
