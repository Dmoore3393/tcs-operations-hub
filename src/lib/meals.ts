import type { DayName, LocationKey } from "@/lib/location-config";
import { localIsoDate } from "@/lib/date-utils";

export type MealType = "Breakfast" | "AM Snack" | "Lunch" | "PM Snack" | "Dinner";
export type MealComponent = "Milk" | "Grain" | "Protein" | "Fruit" | "Vegetable";
export type MealServiceStatus = "Planned" | "Served as Planned" | "Substitution" | "Closed";
export type MealIntake = "Ate all" | "Ate most" | "Ate some" | "Ate a little" | "Refused" | "Not present";

export type MenuSlot = {
  plannedFoods: string;
  actualFoods: string;
  servedTime: string;
  status: MealServiceStatus;
  components: MealComponent[];
  initials: string;
  notes: string;
};

export type WeeklyMenu = {
  id: string;
  location: Exclude<LocationKey, "All Locations">;
  weekOf: string;
  days: Record<DayName, Record<MealType, MenuSlot>>;
};

export type MealServiceRecord = {
  id: string;
  location: Exclude<LocationKey, "All Locations">;
  date: string;
  meal: MealType;
  plannedFoods: string;
  actualFoods: string;
  drinkServed: string;
  servedTime: string;
  components: MealComponent[];
  substitutionReason: string;
  notes: string;
  initials: string;
  childrenLogged: number;
  createdAt: string;
};

export const mealTypes: MealType[] = ["Breakfast", "AM Snack", "Lunch", "PM Snack", "Dinner"];

export const mealDefaults: Record<MealType, { time: string; helper: string; suggestedComponents: MealComponent[] }> = {
  Breakfast: { time: "07:30", helper: "Milk + grain + fruit or vegetable", suggestedComponents: ["Milk", "Grain", "Fruit"] },
  "AM Snack": { time: "09:30", helper: "Choose at least two meal components", suggestedComponents: ["Grain", "Fruit"] },
  Lunch: { time: "11:30", helper: "Milk + protein + grain + fruit + vegetable", suggestedComponents: ["Milk", "Protein", "Grain", "Fruit", "Vegetable"] },
  "PM Snack": { time: "14:30", helper: "Choose at least two meal components", suggestedComponents: ["Protein", "Grain"] },
  Dinner: { time: "16:30", helper: "Milk + protein + grain + fruit + vegetable", suggestedComponents: ["Milk", "Protein", "Grain", "Fruit", "Vegetable"] },
};

export const mealComponents: MealComponent[] = ["Milk", "Grain", "Protein", "Fruit", "Vegetable"];
export const mealIntakeOptions: MealIntake[] = ["Ate all", "Ate most", "Ate some", "Ate a little", "Refused", "Not present"];

const dayOrder: DayName[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function blankSlot(meal: MealType): MenuSlot {
  return {
    plannedFoods: "",
    actualFoods: "",
    servedTime: mealDefaults[meal].time,
    status: "Planned",
    components: [...mealDefaults[meal].suggestedComponents],
    initials: "",
    notes: "",
  };
}

export function createBlankWeeklyMenu(location: Exclude<LocationKey, "All Locations">, weekOf: string): WeeklyMenu {
  const days = Object.fromEntries(dayOrder.map((day) => [
    day,
    Object.fromEntries(mealTypes.map((meal) => [meal, blankSlot(meal)])) as Record<MealType, MenuSlot>,
  ])) as Record<DayName, Record<MealType, MenuSlot>>;

  return {
    id: `menu-${location.toLowerCase().replaceAll(" ", "-")}-${weekOf}`,
    location,
    weekOf,
    days,
  };
}

function setPlanned(menu: WeeklyMenu, day: DayName, meal: MealType, foods: string) {
  menu.days[day][meal].plannedFoods = foods;
}

function createHalcomStarterMenu(): WeeklyMenu {
  const menu = createBlankWeeklyMenu("Halcom", weekStartFor(localIsoDate()));

  setPlanned(menu, "Monday", "Breakfast", "Cereal • banana • milk");
  setPlanned(menu, "Monday", "AM Snack", "Granola bar • apples");
  setPlanned(menu, "Monday", "Lunch", "Chicken nuggets • rice • corn • fruit • milk");
  setPlanned(menu, "Monday", "PM Snack", "Yogurt • crackers");
  setPlanned(menu, "Monday", "Dinner", "Spaghetti with protein • green beans • fruit • milk");

  setPlanned(menu, "Tuesday", "Breakfast", "Waffles • banana • milk");
  setPlanned(menu, "Tuesday", "AM Snack", "Muffin • fruit");
  setPlanned(menu, "Tuesday", "Lunch", "Hot dog on bun • vegetable • fruit • milk");
  setPlanned(menu, "Tuesday", "PM Snack", "Applesauce • crackers");
  setPlanned(menu, "Tuesday", "Dinner", "Chicken Alfredo • broccoli • fruit • milk");

  setPlanned(menu, "Wednesday", "Breakfast", "Oatmeal • fruit • milk");
  setPlanned(menu, "Wednesday", "AM Snack", "Yogurt • granola");
  setPlanned(menu, "Wednesday", "Lunch", "Pizza bagels • salad • fruit • milk");
  setPlanned(menu, "Wednesday", "PM Snack", "Cheese • crackers");
  setPlanned(menu, "Wednesday", "Dinner", "Chicken nuggets • rice • peas • fruit • milk");

  setPlanned(menu, "Thursday", "Breakfast", "French toast • fruit • milk");
  setPlanned(menu, "Thursday", "AM Snack", "Granola bar • banana");
  setPlanned(menu, "Thursday", "Lunch", "Spaghetti with protein • corn • fruit • milk");
  setPlanned(menu, "Thursday", "PM Snack", "Apples • crackers");
  setPlanned(menu, "Thursday", "Dinner", "Hot dog • rice or fries • vegetable • fruit • milk");

  setPlanned(menu, "Friday", "Breakfast", "Pancakes • banana • milk");
  setPlanned(menu, "Friday", "AM Snack", "Yogurt • fruit");
  setPlanned(menu, "Friday", "Lunch", "Corn dogs • green beans • fruit • milk");
  setPlanned(menu, "Friday", "PM Snack", "Muffin • apples");
  setPlanned(menu, "Friday", "Dinner", "Chicken rice bowl • vegetable • fruit • milk");

  setPlanned(menu, "Saturday", "Breakfast", "Cereal • fruit • milk");
  setPlanned(menu, "Saturday", "AM Snack", "Granola bar • fruit");
  setPlanned(menu, "Saturday", "Lunch", "Chicken nuggets • rice • vegetable • fruit • milk");
  setPlanned(menu, "Saturday", "PM Snack", "Crackers • cheese");
  setPlanned(menu, "Saturday", "Dinner", "Hot dogs • fries • vegetable • fruit • milk");

  setPlanned(menu, "Sunday", "Breakfast", "Waffles • fruit • milk");
  setPlanned(menu, "Sunday", "AM Snack", "Muffin • fruit");
  setPlanned(menu, "Sunday", "Lunch", "Chicken nuggets • rice • vegetable • fruit • milk");
  setPlanned(menu, "Sunday", "PM Snack", "Yogurt • crackers");
  setPlanned(menu, "Sunday", "Dinner", "Spaghetti • vegetable • fruit • milk");

  return menu;
}

export const starterWeeklyMenus: WeeklyMenu[] = [createHalcomStarterMenu()];

export const starterMealServices: MealServiceRecord[] = [
  {
    id: "meal-service-1",
    location: "Halcom",
    date: "2026-07-30",
    meal: "Breakfast",
    plannedFoods: "Cereal • banana • milk",
    actualFoods: "Whole-grain cereal • banana • milk",
    drinkServed: "Milk and water",
    servedTime: "07:30",
    components: ["Milk", "Grain", "Fruit"],
    substitutionReason: "",
    notes: "Lactose-free milk used for children with documented dairy needs.",
    initials: "LM",
    childrenLogged: 1,
    createdAt: "2026-07-30T08:06:00-07:00",
  },
];

export function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function weekStartFor(dateText: string) {
  const date = new Date(`${dateText}T12:00:00`);
  const day = date.getDay();
  const distanceToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + distanceToMonday);
  return isoDate(date);
}

export function shiftWeek(weekOf: string, amount: number) {
  const date = new Date(`${weekOf}T12:00:00`);
  date.setDate(date.getDate() + amount * 7);
  return isoDate(date);
}

export function dayNameForDate(dateText: string): DayName {
  const date = new Date(`${dateText}T12:00:00`);
  return dayOrder[(date.getDay() + 6) % 7];
}

export function dateForDay(weekOf: string, day: DayName) {
  const date = new Date(`${weekOf}T12:00:00`);
  date.setDate(date.getDate() + dayOrder.indexOf(day));
  return isoDate(date);
}

export function formatWeekRange(weekOf: string) {
  const start = new Date(`${weekOf}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `${formatter.format(start)}–${formatter.format(end)}, ${end.getFullYear()}`;
}

export const menuDayOrder = dayOrder;
