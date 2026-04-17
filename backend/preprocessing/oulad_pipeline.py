import pandas as pd
import numpy as np
import os

def load_and_preprocess_oulad(data_dir="data/oulad"):
    vle_path = os.path.join(data_dir, "studentVle.csv")
    asm_path = os.path.join(data_dir, "studentAssessment.csv")
    reg_path = os.path.join(data_dir, "studentRegistration.csv")

    if not all(os.path.exists(p) for p in [vle_path, asm_path, reg_path]):
        raise FileNotFoundError("OULAD CSV files missing in backend/data/oulad/")

    print("Loading OULAD CSVs...")
    vle = pd.read_csv(vle_path)
    asm = pd.read_csv(asm_path)
    reg = pd.read_csv(reg_path)

    print("Aggregating interactions...")
    clicks = vle.groupby('id_student')['sum_click'].sum().reset_index()
    clicks.rename(columns={'sum_click': 'sum_clicks'}, inplace=True)
    
    scores = asm.groupby('id_student').agg(
        avg_score=('score', 'mean'),
        submissions=('id_assessment', 'count')
    ).reset_index()
    
    reg['withdrawal_flag'] = reg['date_unregistration'].notnull().astype(int)
    withdrawals = reg.groupby('id_student')['withdrawal_flag'].max().reset_index()

    print("Merging dataset...")
    df = clicks.merge(scores, on='id_student', how='inner')
    df = df.merge(withdrawals, on='id_student', how='inner')
    
    # Estimate total assessments contextually or default cap
    df['submission_rate'] = df['submissions'] / 10.0
    df['submission_rate'] = df['submission_rate'].clip(upper=1.0)
    df.fillna({'avg_score': 0}, inplace=True)

    median_clicks = df['sum_clicks'].median()
    
    def assign_label(row):
        score, clks = row['avg_score'], row['sum_clicks']
        if score >= 70 and clks > median_clicks:
            return "Engaged"
        elif score < 50 and clks > median_clicks:
            return "Struggling"
        elif clks < 0.3 * median_clicks:
            return "Unengaged"
        return "Engaged" if score >= 50 else "Struggling"

    df['label'] = df.apply(assign_label, axis=1)

    features = ['sum_clicks', 'avg_score', 'submission_rate', 'withdrawal_flag']
    X = df[features]
    y = df['label']
    
    return X, y, median_clicks
