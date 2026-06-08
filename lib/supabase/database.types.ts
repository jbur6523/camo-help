export type PromoterStatus = "pending" | "active" | "denied" | "disabled";

export type Database = {
  public: {
    Tables: {
      promoters: {
        Row: {
          id: string;
          promotion_name: string;
          promoter_license_number: string;
          promoter_email: string;
          contact_name: string;
          phone: string;
          website_url: string | null;
          status: PromoterStatus;
          created_at: string;
          updated_at: string;
          approved_at: string | null;
        };
        Insert: {
          id?: string;
          promotion_name: string;
          promoter_license_number: string;
          promoter_email: string;
          contact_name: string;
          phone: string;
          website_url?: string | null;
          status?: PromoterStatus;
          created_at?: string;
          updated_at?: string;
          approved_at?: string | null;
        };
        Update: {
          id?: string;
          promotion_name?: string;
          promoter_license_number?: string;
          promoter_email?: string;
          contact_name?: string;
          phone?: string;
          website_url?: string | null;
          status?: PromoterStatus;
          created_at?: string;
          updated_at?: string;
          approved_at?: string | null;
        };
      };
    };
  };
};
