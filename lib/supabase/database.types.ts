export type PromoterStatus = "pending" | "active" | "denied" | "disabled";

export type Database = {
  public: {
    Tables: {
      promoters: {
        Row: {
          id: string;
          promotion_name: string;
          license_number: string;
          email: string;
          contact_name: string;
          phone: string;
          website_or_social: string | null;
          status: PromoterStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          promotion_name: string;
          license_number: string;
          email: string;
          contact_name: string;
          phone: string;
          website_or_social?: string | null;
          status?: PromoterStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          promotion_name?: string;
          license_number?: string;
          email?: string;
          contact_name?: string;
          phone?: string;
          website_or_social?: string | null;
          status?: PromoterStatus;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      promoter_status: PromoterStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
