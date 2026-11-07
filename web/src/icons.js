import {
  Book, BookOpen, Box, Briefcase, Building2, Calendar, CheckSquare, Contact, Crown, FileText, List, Megaphone,
  Package, Shapes, StickyNote, Tag, UserPlus, Users,
} from "lucide-react";

const ICONS = {
  "building-2": Building2, contact: Contact, "user-plus": UserPlus, crown: Crown, package: Package, box: Box,
  "book-open": BookOpen, tag: Tag, "file-text": FileText, list: List, megaphone: Megaphone, users: Users,
  briefcase: Briefcase, "check-square": CheckSquare, calendar: Calendar, "sticky-note": StickyNote, shapes: Shapes,
};

export const objectIcon = (name) => ICONS[name] ?? Book;
