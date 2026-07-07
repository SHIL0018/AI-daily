import { defineStore } from "pinia";
import { todayInShanghai } from "../api";

export const useDateStore = defineStore("date", {
  state: () => ({
    selectedDate: todayInShanghai()
  })
});
