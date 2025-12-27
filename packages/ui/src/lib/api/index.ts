import { OP3_API_URL } from "@/config";

export const getApiUrl = () => {
  return OP3_API_URL;
};

export const get = async (endpoint: `/${string}`) => {
  return fetch(`${getApiUrl()}${endpoint}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }).then((response) => response.json());
};

export const post = async (endpoint: `/${string}`, body: any) => {
  return fetch(`${getApiUrl()}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).then((response) => response.json());
};

export const put = async (endpoint: `/${string}`, body: any) => {
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

export const getSearchQuery = (params: Record<string, any>) => {
  const searchParams = new URLSearchParams();

  for (const key in params) {
    if (params[key] !== null && params[key] !== undefined) {
      searchParams.append(key, params[key]);
    }
  }

  return searchParams.toString();
};
