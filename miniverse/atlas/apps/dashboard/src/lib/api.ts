import { AtlasAPI } from "@atlas/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
export const api = new AtlasAPI(API_URL);
