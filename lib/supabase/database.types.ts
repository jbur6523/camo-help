export type PromoterStatus = "pending" | "active" | "denied" | "disabled";
export type PromoterAccountLinkStatus = "confirmed" | "pending_admin_confirmation";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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
        Relationships: [];
      };
      promoter_accounts: {
        Row: {
          id: string;
          promoter_id: string;
          auth_user_id: string;
          link_status: PromoterAccountLinkStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          promoter_id: string;
          auth_user_id: string;
          link_status?: PromoterAccountLinkStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          promoter_id?: string;
          auth_user_id?: string;
          link_status?: PromoterAccountLinkStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "promoter_accounts_promoter_id_fkey";
            columns: ["promoter_id"];
            isOneToOne: true;
            referencedRelation: "promoters";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      register_promoter_account: {
        Args: {
          p_auth_user_id: string;
          p_email: string;
          p_promotion_name: string;
          p_last_promotion_date: string;
          p_contact_name: string;
          p_government_id_filename: string;
          p_website_or_social: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      promoter_status: PromoterStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
