import pandas as pd
import time
import requests

def process_csv(path_to_file):
    df = pd.read_csv(path_to_file)
    return df

def send_data(data, server_address):
    try:
        response = requests.post(f"{server_address}/api/package", json=data)
        if response.status_code == 200:
            print(f"Data sent successfully")
        else:
            print(f"Failed to send data: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"Error sending data: {e}")

def simulate_sending(given_df, server_address):
    given_df.sort_values(by=['Timestamp'], inplace=True)

    first_timestamp = given_df.iloc[0]['Timestamp']
    current_time = time.time()

    for idx, row in given_df.iterrows():
        current_time_diff = time.time() - current_time
        row_time_diff = row['Timestamp'] - first_timestamp
        time_to_wait = row_time_diff - current_time_diff
        if time_to_wait > 0:
            time.sleep(time_to_wait)

        data_to_send = {
            'ip_address': row['ip address'],
            'latitude': float(row['Latitude']),
            'longitude': float(row['Longitude']),
            'timestamp': int(row['Timestamp']),
            'suspicious': bool(row['suspicious'])
        }
        send_data(data_to_send, server_address)

def main():
    path_to_file = './data/ip_addresses.csv'
    server_address = 'http://server:5555' 
    try:
        print('Getting data from csv')
        data_df = process_csv(path_to_file)
        print('Starting sending')
        simulate_sending(data_df, server_address)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()



